import { bestSet, epley1RM, suggestNextWeight } from "@/src/domain/strength";

describe("epley1RM", () => {
  it("con una ripetizione il massimale è il carico stesso", () => {
    expect(epley1RM(100, 1)).toBeCloseTo(100);
  });

  it("applica la formula di Epley", () => {
    // 1RM = peso * (1 + reps/30)
    expect(epley1RM(100, 10)).toBeCloseTo(100 * (1 + 10 / 30));
  });

  it("con zero ripetizioni o carico non positivo ritorna null", () => {
    expect(epley1RM(100, 0)).toBeNull();
    expect(epley1RM(0, 5)).toBeNull();
    expect(epley1RM(-50, 5)).toBeNull();
  });

  it("oltre le 12 ripetizioni la formula perde senso e ritorna null", () => {
    // Epley è attendibile solo in basso: estrapolare da 30 ripetizioni darebbe
    // un massimale del tutto immaginario.
    expect(epley1RM(50, 30)).toBeNull();
  });
});

describe("bestSet", () => {
  const set = (weight: number, reps: number) => ({ weight, reps });

  it("sceglie la serie col massimale stimato più alto, non il carico più alto", () => {
    // 80x8 stima 101 kg, 100x1 stima 100: vince la prima nonostante il carico minore.
    const best = bestSet([set(100, 1), set(80, 8)]);
    expect(best?.weight).toBe(80);
  });

  it("ignora le serie non valutabili", () => {
    expect(bestSet([set(0, 5), set(60, 5)])?.weight).toBe(60);
  });

  it("senza serie valutabili ritorna null", () => {
    expect(bestSet([set(0, 0)])).toBeNull();
  });

  it("su lista vuota ritorna null", () => {
    expect(bestSet([])).toBeNull();
  });
});

describe("suggestNextWeight", () => {
  it("propone un incremento quando tutte le serie hanno centrato il target", () => {
    const next = suggestNextWeight({
      lastSets: [
        { weight: 60, reps: 10 },
        { weight: 60, reps: 10 },
        { weight: 60, reps: 10 },
      ],
      targetReps: 10,
      increment: 2.5,
    });
    expect(next).toBe(62.5);
  });

  it("tiene il carico quando il target non è stato raggiunto ovunque", () => {
    const next = suggestNextWeight({
      lastSets: [
        { weight: 60, reps: 10 },
        { weight: 60, reps: 8 },
      ],
      targetReps: 10,
      increment: 2.5,
    });
    expect(next).toBe(60);
  });

  it("senza serie precedenti non propone nulla", () => {
    expect(
      suggestNextWeight({ lastSets: [], targetReps: 10, increment: 2.5 }),
    ).toBeNull();
  });
});

describe("suggestNextWeight con le serie previste", () => {
  const set = (weight: number, reps: number) => ({ weight, reps });

  it("non sale se la seduta è stata interrotta a metà", () => {
    // Due serie da 10 su quattro previste: il target NON è stato centrato,
    // anche se le due fatte erano perfette.
    const next = suggestNextWeight({
      lastSets: [set(60, 10), set(60, 10)],
      targetReps: 10,
      targetSets: 4,
      increment: 2.5,
    });
    expect(next).toBe(60);
  });

  it("sale se tutte le serie previste sono state completate", () => {
    const next = suggestNextWeight({
      lastSets: [set(60, 10), set(60, 10), set(60, 10), set(60, 10)],
      targetReps: 10,
      targetSets: 4,
      increment: 2.5,
    });
    expect(next).toBe(62.5);
  });

  it("una serie in più del previsto non impedisce di salire", () => {
    const next = suggestNextWeight({
      lastSets: [set(60, 10), set(60, 10), set(60, 10)],
      targetReps: 10,
      targetSets: 2,
      increment: 2.5,
    });
    expect(next).toBe(62.5);
  });

  it("senza serie previste giudica solo quello che è stato fatto", () => {
    const next = suggestNextWeight({
      lastSets: [set(60, 10)],
      targetReps: 10,
      increment: 2.5,
    });
    expect(next).toBe(62.5);
  });
});
