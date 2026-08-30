import { buildComparison } from "@/src/domain/comparison";

const tutte = { calories: true, steps: true, workouts: true };

describe("il confronto con un amico", () => {
  it("sui passi dice chi e' davanti", () => {
    const righe = buildComparison(
      { kcal: null, steps: 9000, workouts: null },
      { kcal: null, steps: 4000, workouts: null },
      { calories: false, steps: true, workouts: false },
    );

    expect(righe).toEqual([
      { metric: "steps", mine: 9000, theirs: 4000, ahead: "mine" },
    ]);
  });

  it("a pari passi non fa vincere nessuno", () => {
    const [riga] = buildComparison(
      { kcal: null, steps: 5000, workouts: null },
      { kcal: null, steps: 5000, workouts: null },
      { calories: false, steps: true, workouts: false },
    );

    expect(riga.ahead).toBe("tie");
  });

  /**
   * La regola che conta di questo file. Mangiare piu' o meno di un'altra
   * persona non e' meglio ne' peggio: dipende da quanto pesa, da quanto si
   * muove e da cosa sta cercando di fare. Un vincitore sarebbe un consiglio,
   * e sarebbe sbagliato.
   */
  it("sulle calorie mostra i due numeri e non dichiara un vincitore", () => {
    const [riga] = buildComparison(
      { kcal: 1800, steps: null, workouts: null },
      { kcal: 2600, steps: null, workouts: null },
      { calories: true, steps: false, workouts: false },
    );

    expect(riga.mine).toBe(1800);
    expect(riga.theirs).toBe(2600);
    expect(riga.ahead).toBeNull();
  });

  /**
   * "Pesi sei chili piu' del tuo amico" non e' un'informazione utile a
   * nessuno. Il peso non entra proprio nel confronto.
   */
  it("il peso non e' una metrica confrontabile", () => {
    const righe = buildComparison(
      { kcal: null, steps: null, workouts: null },
      { kcal: null, steps: null, workouts: null },
      tutte,
    );

    expect(righe.map((r) => r.metric)).not.toContain("weight");
  });

  it("un numero mancante non e' un pareggio", () => {
    const [riga] = buildComparison(
      { kcal: null, steps: 8000, workouts: null },
      { kcal: null, steps: null, workouts: null },
      { calories: false, steps: true, workouts: false },
    );

    // Dire "sei avanti" perche' l'altro non ha registrato i passi sarebbe
    // una bugia detta con un numero.
    expect(riga.ahead).toBeNull();
    expect(riga.theirs).toBeNull();
  });

  it("una metrica non condivisa non compare per niente", () => {
    const righe = buildComparison(
      { kcal: 2000, steps: 8000, workouts: 1 },
      { kcal: 2200, steps: 7000, workouts: 2 },
      { calories: false, steps: true, workouts: false },
    );

    expect(righe.map((r) => r.metric)).toEqual(["steps"]);
  });

  it("con tutto condiviso tiene l'ordine e confronta solo l'attivita'", () => {
    const righe = buildComparison(
      { kcal: 2000, steps: 8000, workouts: 1 },
      { kcal: 2200, steps: 7000, workouts: 2 },
      tutte,
    );

    expect(righe.map((r) => [r.metric, r.ahead])).toEqual([
      ["kcal", null],
      ["steps", "mine"],
      ["workouts", "theirs"],
    ]);
  });
});
