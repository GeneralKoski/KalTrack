import {
  matchLoggedSets,
  type LoggedRef,
  type PlannedRef,
} from "@/src/domain/session";

const planned = (
  key: string,
  blockId: string,
  exerciseId: string,
  setIndex: number,
): PlannedRef => ({ key, blockId, exerciseId, setIndex });

const logged = (
  id: string,
  blockRef: string | null,
  exerciseId: string,
  setIndex: number,
): LoggedRef => ({ id, blockRef, exerciseId, setIndex });

describe("matchLoggedSets", () => {
  it("riaggancia ogni serie alla sua riga", () => {
    const rows = [
      planned("a:0", "a", "panca", 0),
      planned("a:1", "a", "panca", 1),
    ];

    expect(matchLoggedSets(rows, [logged("s1", "a", "panca", 1)])).toEqual({
      "a:1": "s1",
    });
  });

  it("lascia da spuntare le righe senza una serie scritta", () => {
    const rows = [planned("a:0", "a", "panca", 0)];

    expect(matchLoggedSets(rows, [])).toEqual({});
  });

  it("non spunta due righe con la stessa serie", () => {
    // Un dropset: lo stesso esercizio due volte nello stesso blocco, quindi
    // blocco + esercizio + indice non bastano a distinguerle.
    const rows = [
      planned("a:primo:0", "a", "panca", 0),
      planned("a:secondo:0", "a", "panca", 0),
    ];

    expect(matchLoggedSets(rows, [logged("s1", "a", "panca", 0)])).toEqual({
      "a:primo:0": "s1",
    });
  });

  it("assegna in ordine quando le serie sono piu' d'una sulle righe gemelle", () => {
    const rows = [
      planned("a:primo:0", "a", "panca", 0),
      planned("a:secondo:0", "a", "panca", 0),
    ];
    const sets = [logged("s1", "a", "panca", 0), logged("s2", "a", "panca", 0)];

    expect(matchLoggedSets(rows, sets)).toEqual({
      "a:primo:0": "s1",
      "a:secondo:0": "s2",
    });
  });

  it("tiene separati blocchi diversi", () => {
    const rows = [
      planned("a:0", "a", "panca", 0),
      planned("b:0", "b", "panca", 0),
    ];

    expect(matchLoggedSets(rows, [logged("s1", "b", "panca", 0)])).toEqual({
      "b:0": "s1",
    });
  });

  it("una serie senza blocco vale per la prima riga che le somiglia", () => {
    const rows = [planned("a:0", "a", "panca", 0)];

    expect(matchLoggedSets(rows, [logged("s1", null, "panca", 0)])).toEqual({
      "a:0": "s1",
    });
  });

  it("scarta una serie che non corrisponde a nessuna riga", () => {
    const rows = [planned("a:0", "a", "panca", 0)];

    expect(matchLoggedSets(rows, [logged("s1", "a", "squat", 0)])).toEqual({});
  });
});
