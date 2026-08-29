export interface ShoppingItem {
  foodId: string;
  name: string;
  grams: number;
}

/**
 * Lista della spesa da un piano pasti: stesso ingrediente sommato una volta
 * sola, in ordine alfabetico.
 *
 * Il raggruppamento è per id e non per nome: due prodotti diversi possono
 * chiamarsi allo stesso modo (due yogurt di marche diverse), e sommarli
 * darebbe una quantità che non corrisponde a niente da comprare.
 */
export function buildShoppingList(items: ShoppingItem[]): ShoppingItem[] {
  const totals = new Map<string, ShoppingItem>();

  for (const item of items) {
    if (item.grams <= 0) continue;
    const existing = totals.get(item.foodId);
    if (existing) {
      existing.grams += item.grams;
    } else {
      totals.set(item.foodId, { ...item });
    }
  }

  return [...totals.values()].sort((a, b) => a.name.localeCompare(b.name, "it"));
}

/** Quantità leggibile al supermercato: grammi sotto il chilo, chili sopra. */
export function formatQuantity(grams: number): string {
  if (grams < 1000) return `${Math.round(grams)} g`;
  const kg = grams / 1000;
  const rounded = Math.round(kg * 10) / 10;
  return `${String(rounded).replace(".", ",")} kg`;
}
