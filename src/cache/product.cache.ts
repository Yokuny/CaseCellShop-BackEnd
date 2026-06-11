import { env, redis } from "../config";
import { logger } from "../logger";
import { cacheOps } from "../metrics";
import type { Product } from "../models";

const FRESH_KEY = "catalog:fresh";
const STALE_KEY = "catalog:stale"; // cópia de vida longa para fallback
const LOCK_KEY = "catalog:lock";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const readFresh = async (): Promise<Product[] | null> => {
  const raw = await redis.get(FRESH_KEY);
  return raw ? (JSON.parse(raw) as Product[]) : null;
};

const readStale = async (): Promise<Product[] | null> => {
  const raw = await redis.get(STALE_KEY);
  return raw ? (JSON.parse(raw) as Product[]) : null;
};

const writeCache = async (products: Product[]): Promise<void> => {
  const payload = JSON.stringify(products);
  await redis.set(FRESH_KEY, payload, "EX", env.PRODUCT_CACHE_TTL);
  await redis.set(STALE_KEY, payload, "EX", env.PRODUCT_CACHE_STALE_TTL);
};

/**
 * Cache-aside com proteção contra cache stampede e fallback stale.
 * - HIT: serve do `fresh`.
 * - MISS: apenas UM request adquire o lock e chama o `loader` (DB); os demais
 *   aguardam a repopulação ou servem o `stale`, evitando martelar o banco.
 * - Se o `loader` falhar, serve o `stale` (stale-while-error) quando existir.
 */
export const getCatalogCached = async (loader: () => Promise<Product[]>): Promise<Product[]> => {
  const fresh = await readFresh();
  if (fresh) {
    cacheOps.inc({ cache: "catalog", result: "hit" });
    return fresh;
  }

  cacheOps.inc({ cache: "catalog", result: "miss" });

  // Single-flight: tenta virar o "líder" que repopula o cache.
  const isLeader = (await redis.set(LOCK_KEY, "1", "PX", 5000, "NX")) === "OK";

  if (!isLeader) {
    // Outro request já está carregando. Espera um pouco pela repopulação.
    for (let i = 0; i < 10; i++) {
      await sleep(100);
      const repopulated = await readFresh();
      if (repopulated) {
        cacheOps.inc({ cache: "catalog", result: "hit" });
        return repopulated;
      }
    }
    const stale = await readStale();
    if (stale) {
      cacheOps.inc({ cache: "catalog", result: "stale" });
      return stale;
    }
    // Fallback final: carrega direto (raro — lock expirou sem repopular).
  }

  try {
    const products = await loader();
    await writeCache(products);
    return products;
  } catch (e) {
    const stale = await readStale();
    if (stale) {
      cacheOps.inc({ cache: "catalog", result: "stale" });
      logger.warn({ err: (e as Error).message }, "[CACHE] loader falhou, servindo stale");
      return stale;
    }
    cacheOps.inc({ cache: "catalog", result: "error" });
    throw e;
  } finally {
    if (isLeader) await redis.del(LOCK_KEY);
  }
};

// Invalida a cópia fresh (mantém a stale como rede de proteção). Chamado quando
// o estoque muda no checkout, para a disponibilidade não ficar obsoleta.
export const invalidateCatalog = async (): Promise<void> => {
  await redis.del(FRESH_KEY);
};
