import { beforeEach, describe, expect, it, vi } from "vitest";

// Redis falso em memória, suficiente para o cache-aside (get/set/del + NX).
const { store } = vi.hoisted(() => {
  const map = new Map<string, string>();
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
        map.delete(k);
        return 1;
      },
    },
  };
});

vi.mock("../src/config", () => ({ env: { PRODUCT_CACHE_TTL: 30, PRODUCT_CACHE_STALE_TTL: 300 }, redis: store }));
vi.mock("../src/metrics", () => ({ cacheOps: { inc: vi.fn() } }));
vi.mock("../src/logger", () => ({ logger: { warn: vi.fn(), info: vi.fn() } }));

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
});
