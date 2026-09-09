import { movePosition } from "@/src/domain/reorder";

const listOf = (...ids: string[]): Record<string, number> =>
  Object.fromEntries(ids.map((id, index) => [id, index]));

/** Rilegge la mappa come elenco: e' cosi' che la schermata la consuma. */
const order = (positions: Record<string, number>): string[] =>
  Object.keys(positions).sort((a, b) => positions[a] - positions[b]);

describe("movePosition", () => {
  it("scendendo, chi sta in mezzo sale di uno", () => {
    const next = movePosition(listOf("a", "b", "c", "d"), 0, 2);
    expect(order(next)).toEqual(["b", "c", "a", "d"]);
  });

  it("salendo, chi sta in mezzo scende di uno", () => {
    const next = movePosition(listOf("a", "b", "c", "d"), 3, 1);
    expect(order(next)).toEqual(["a", "d", "b", "c"]);
  });

  it("uno spostamento di un posto e' uno scambio", () => {
    const next = movePosition(listOf("a", "b", "c"), 1, 2);
    expect(order(next)).toEqual(["a", "c", "b"]);
  });

  it("fermo dov'e' non cambia niente", () => {
    const start = listOf("a", "b", "c");
    expect(movePosition(start, 1, 1)).toEqual(start);
  });

  /** Le posizioni restano una permutazione: nessun buco, nessun doppione. */
  it("non perde ne' duplica una posizione", () => {
    const next = movePosition(listOf("a", "b", "c", "d", "e"), 4, 0);
    expect(Object.values(next).sort()).toEqual([0, 1, 2, 3, 4]);
    expect(order(next)).toEqual(["e", "a", "b", "c", "d"]);
  });

  it("con un elenco vuoto torna un elenco vuoto", () => {
    expect(movePosition({}, 0, 1)).toEqual({});
  });
});
