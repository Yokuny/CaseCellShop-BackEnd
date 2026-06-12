import { env, redis } from "../config";
import { logger } from "../logger";
import { cacheOps } from "../metrics";
import type { Product } from "../models";

const FRESH_KEY = "catalog:fresh";
const STALE_KEY = "catalog:stale"; // cópia de vida longa para fallback
const LOCK_KEY = "catalog:lock";
const GEN_KEY = "catalog:gen"; // contador de geração; incrementado a cada invalidação

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const readFresh = async (): Promise<Product[] | null> => {
  const raw = await redis.get(FRESH_KEY);
  return raw ? (JSON.parse(raw) as Product[]) : null;
};

const readStale = async (): Promise<Product[] | null> => {
  const raw = await redis.get(STALE_KEY);
  return raw ? (JSON.parse(raw) as Product[]) : null;
};

const readGen = async (): Promise<string> => (await redis.get(GEN_KEY)) ?? "0";

// Grava fresh+stale SOMENTE se a geração não mudou desde o início do load.
// Fecha o race read-then-write: se um checkout invalidou enquanto o líder lia
// o DB, a geração avançou e descartamos o snapshot obsoleto (em vez de cacheá-lo).
// Atômico (compare-and-set via Lua) para não haver janela entre o GET e o SET.
const WRITE_IF_GEN_UNCHANGED = `
local cur = redis.call('GET', KEYS[3])
if not cur then cur = '0' end
if cur == ARGV[4] then
  redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[2])
  redis.call('SET', KEYS[2], ARGV[1], 'EX', ARGV[3])
  return 1
end
return 0
`;

const writeCacheIfFresh = async (products: Product[], genBefore: string): Promise<boolean> => {
  const payload = JSON.stringify(products);
  const wrote = (await redis.eval(
    WRITE_IF_GEN_UNCHANGED,
    3,
    FRESH_KEY,
    STALE_KEY,
    GEN_KEY,
    payload,
    String(env.PRODUCT_CACHE_TTL),
    String(env.PRODUCT_CACHE_STALE_TTL),
    genBefore,
  )) as number;
  return wrote === 1;
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

  // Captura a geração ANTES de carregar o DB. Se mudar até a hora de gravar,
  // significa que houve uma invalidação concorrente e o snapshot é obsoleto.
  const genBefore = await readGen();

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
    const cached = await writeCacheIfFresh(products, genBefore);
    if (!cached) {
      // Houve invalidação durante o load: não cacheamos dado obsoleto.
      // O próximo request dá MISS e recarrega o estado já atualizado.
      cacheOps.inc({ cache: "catalog", result: "stale_write_skipped" });
      logger.debug("[CACHE] geração mudou durante o load, snapshot descartado");
    }
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

// Invalida a cópia fresh (mantém a stale como rede de proteção) e avança a
// geração. O INCR é o que neutraliza o race read-then-write: um load que já
// começou e ainda não gravou verá a geração diferente e descartará seu snapshot.
// Chamado sempre que o estoque muda (checkout e reconciliação do worker).
export const invalidateCatalog = async (): Promise<void> => {
  await redis.multi().del(FRESH_KEY).incr(GEN_KEY).exec();
};
