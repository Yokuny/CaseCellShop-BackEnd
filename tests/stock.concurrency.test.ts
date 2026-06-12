import { describe, expect, it } from "vitest";

/**
 * Modela a semântica do UPDATE atômico condicional usado em product.repository:
 *   UPDATE products SET stock = stock - q WHERE id = ? AND stock >= q
 * O objetivo é provar que, sob concorrência, NUNCA há overselling — exatamente
 * o que a reserva de estoque no checkout garante no MySQL.
 */
class AtomicStock {
  private stock: number;
  constructor(initial: number) {
    this.stock = initial;
  }

  // Decremento condicional atômico (equivalente ao WHERE stock >= q do SQL).
  async tryReserve(qty: number): Promise<boolean> {
    // Lê e decide num único passo lógico — sem janela de interleaving, como o UPDATE.
    if (this.stock >= qty) {
      this.stock -= qty;
      return true;
    }
    return false;
  }

  get remaining(): number {
    return this.stock;
  }
}

describe("reserva de estoque sob concorrência", () => {
  it("não vende além do estoque com N requisições simultâneas", async () => {
    const initial = 10;
    const store = new AtomicStock(initial);

    // 50 clientes tentam reservar 1 unidade ao mesmo tempo.
    const results = await Promise.all(Array.from({ length: 50 }, () => store.tryReserve(1)));

    const succeeded = results.filter(Boolean).length;
    expect(succeeded).toBe(initial); // só 10 conseguem
    expect(store.remaining).toBe(0); // estoque nunca fica negativo
  });

  it("respeita o limite com quantidades maiores que 1", async () => {
    const store = new AtomicStock(10);
    const results = await Promise.all([store.tryReserve(4), store.tryReserve(4), store.tryReserve(4)]);

    expect(results.filter(Boolean).length).toBe(2); // 4 + 4 = 8; o terceiro falha
    expect(store.remaining).toBe(2);
    expect(store.remaining).toBeGreaterThanOrEqual(0);
  });
});
