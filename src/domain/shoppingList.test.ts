import { buildShoppingList, formatQuantity } from "@/src/domain/shoppingList";

describe("buildShoppingList", () => {
  it("somma le quantità dello stesso ingrediente", () => {
    const list = buildShoppingList([
      { foodId: "riso", name: "Riso", grams: 200 },
      { foodId: "riso", name: "Riso", grams: 150 },
    ]);
    expect(list).toEqual([{ foodId: "riso", name: "Riso", grams: 350 }]);
  });

  it("tiene separati ingredienti diversi", () => {
    const list = buildShoppingList([
      { foodId: "riso", name: "Riso", grams: 200 },
      { foodId: "pollo", name: "Pollo", grams: 300 },
    ]);
    expect(list).toHaveLength(2);
  });

  it("ordina alfabeticamente, non per ordine di inserimento", () => {
    // Al supermercato si cerca per nome, non per quando l'hai pianificato.
    const list = buildShoppingList([
      { foodId: "zucchine", name: "Zucchine", grams: 300 },
      { foodId: "avena", name: "Avena", grams: 100 },
    ]);
    expect(list.map((i) => i.name)).toEqual(["Avena", "Zucchine"]);
  });

  it("ignora le quantità non positive invece di sottrarre", () => {
    const list = buildShoppingList([
      { foodId: "riso", name: "Riso", grams: 200 },
      { foodId: "riso", name: "Riso", grams: -50 },
    ]);
    expect(list[0].grams).toBe(200);
  });

  it("su lista vuota ritorna vuoto", () => {
    expect(buildShoppingList([])).toEqual([]);
  });

  it("raggruppa per id, non per nome", () => {
    // Due prodotti possono chiamarsi uguale ma essere righe diverse.
    const list = buildShoppingList([
      { foodId: "a", name: "Yogurt", grams: 150 },
      { foodId: "b", name: "Yogurt", grams: 150 },
    ]);
    expect(list).toHaveLength(2);
  });
});

describe("formatQuantity", () => {
  it("sotto il chilo resta in grammi", () => {
    expect(formatQuantity(350)).toBe("350 g");
  });

  it("dal chilo in su passa ai chili", () => {
    expect(formatQuantity(1500)).toBe("1,5 kg");
  });

  it("un chilo tondo non mostra i decimali", () => {
    expect(formatQuantity(2000)).toBe("2 kg");
  });

  it("arrotonda i grammi all'unità", () => {
    expect(formatQuantity(349.7)).toBe("350 g");
  });
});
