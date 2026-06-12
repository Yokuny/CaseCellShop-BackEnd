import { beforeEach, describe, expect, it, vi } from "vitest";

// Redis falso em memória, suficiente para o cache-aside
// (get/set/del + NX, multi().del().incr().exec() e eval do compare-and-set).
const { store } = vi.hoisted(() => {
  const map = new Map<string, string>();
  const del = (k: string) => {
    map.delete(k);
    return 1;
  };
  const incr = (k: string) => {
    const next = Number(map.get(k) ?? "0") + 1;
    map.set(k, String(next));
    return next;
  };
  return {
    store: {
      map,
      async get(k: string) {
        return map.has(k) ? map.get(k) : null;
      },
      async set(k: string, v: string, ...args: unknown[]) {
        if (args.includes("NX") && map.has(k)) return null;
        map.set(k, v);
        return "OK";
      },
      async del(k: string) {
        return del(k);
      },
      // Replica o WRITE_IF_GEN_UNCHANGED: grava fresh+stale só se a geração casar.
      async eval(_script: string, _numKeys: number, freshKey: string, staleKey: string, genKey: string, payload: string, _freshTtl: string, _staleTtl: string, genBefore: string) {
        const cur = map.get(genKey) ?? "0";
        if (cur !== genBefore) return 0;
        map.set(freshKey, payload);
        map.set(staleKey, payload);
        return 1;
      },
      // Pipeline encadeável usada pela invalidação (del fresh + incr gen).
      multi() {
        const queue: Array<() => unknown> = [];
        const chain = {
          del(k: string) {
            queue.push(() => del(k));
            return chain;
          },
          incr(k: string) {
            queue.push(() => incr(k));
            return chain;
          },
          async exec() {
            return queue.map((op) => [null, op()]);
          },
        };
        return chain;
      },
    },
  };
});

vi.mock("../src/config", () => ({ env: { PRODUCT_CACHE_TTL: 30, PRODUCT_CACHE_STALE_TTL: 300 }, redis: store }));
vi.mock("../src/metrics", () => ({ cacheOps: { inc: vi.fn() } }));
vi.mock("../src/logger", () => ({ logger: { warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));

import { getCatalogCached, invalidateCatalog } from "../src/cache/product.cache";

const sample = [{ id: "a", name: "A", description: "", price: 1, stock: 5, category: "x", updatedAt: "" }];

describe("cache-aside do catálogo", () => {
  beforeEach(() => store.map.clear());

  it("MISS popula o cache e HIT serve sem chamar o loader de novo", async () => {
    const loader = vi.fn().mockResolvedValue(sample);

    const first = await getCatalogCached(loader); // miss → loader
    const second = await getCatalogCached(loader); // hit → cache

    expect(loader).toHaveBeenCalledTimes(1);
    expect(first).toEqual(sample);
    expect(second).toEqual(sample);
  });

  it("invalidação força recarga no próximo acesso", async () => {
    const loader = vi.fn().mockResolvedValue(sample);

    await getCatalogCached(loader);
    await invalidateCatalog();
    await getCatalogCached(loader);

    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("serve cópia stale quando o loader falha", async () => {
    const okLoader = vi.fn().mockResolvedValue(sample);
    await getCatalogCached(okLoader); // popula fresh + stale

    await invalidateCatalog(); // remove só o fresh

    const failing = vi.fn().mockRejectedValue(new Error("DB down"));
    const result = await getCatalogCached(failing);
    expect(result).toEqual(sample); // fallback stale
  });

  it("descarta snapshot obsoleto quando há invalidação durante o load (anti-race)", async () => {
    const fresh = [{ ...sample[0], stock: 9 }];
    // Loader lento que simula uma invalidação concorrente no meio do carregamento.
    const racingLoader = vi.fn().mockImplementation(async () => {
      await invalidateCatalog(); // estoque mudou enquanto líamos o "DB"
      return sample; // snapshot já nasce obsoleto
    });

    await getCatalogCached(racingLoader);

    // O fresh obsoleto NÃO pode ter sido gravado: próximo acesso dá MISS e recarrega.
    const reloader = vi.fn().mockResolvedValue(fresh);
    const after = await getCatalogCached(reloader);
    expect(reloader).toHaveBeenCalledTimes(1);
    expect(after).toEqual(fresh);
  });
});
