import {
  buildGymComparison,
  buildMultiComparison,
  type ComparisonCell,
  type Participant,
  type SharedExercise,
} from "@/src/domain/comparison";

const tutte = { calories: true, steps: true, workouts: true };
const niente = { calories: false, steps: false, workouts: false };

function persona(
  handle: string,
  totals: Partial<Participant["totals"]> = {},
  shares: Participant["shares"] = tutte,
  exercises: SharedExercise[] = [],
): Participant {
  return {
    handle,
    displayName: handle,
    totals: { kcal: null, steps: null, workouts: null, ...totals },
    shares,
    exercises,
  };
}

const esercizio = (
  name: string,
  overrides: Partial<SharedExercise> = {},
): SharedExercise => ({
  name,
  sets: 4,
  totalReps: 32,
  volumeKg: 2960,
  topWeightKg: 92.5,
  ...overrides,
});

/** Chi e' segnato davanti, per leggere le asserzioni a colpo d'occhio. */
const primi = (cells: ComparisonCell[]) =>
  cells.filter((c) => c.leading).map((c) => c.handle);

const valore = (cells: ComparisonCell[], handle: string) =>
  cells.find((c) => c.handle === handle)?.value;

describe("il confronto con gli amici", () => {
  it("sui passi dice chi e' davanti", () => {
    const righe = buildMultiComparison(
      persona("io", { steps: 9000 }),
      [persona("anna", { steps: 4000 }, { ...niente, steps: true })],
    );

    expect(righe).toHaveLength(1);
    expect(righe[0].metric).toBe("steps");
    expect(primi(righe[0].cells)).toEqual(["io"]);
  });

  it("a pari passi non fa vincere nessuno da solo", () => {
    const [riga] = buildMultiComparison(
      persona("io", { steps: 5000 }),
      [persona("anna", { steps: 5000 }, { ...niente, steps: true })],
    );

    // Un pareggio non ha un vincitore da scegliere: davanti ci sono tutti e
    // due, e la schermata li mostra tutti e due in evidenza.
    expect(primi(riga.cells)).toEqual(["io", "anna"]);
  });

  /**
   * La regola che conta di questo file. Mangiare piu' o meno di un'altra
   * persona non e' meglio ne' peggio: dipende da quanto pesa, da quanto si
   * muove e da cosa sta cercando di fare. Un vincitore sarebbe un consiglio,
   * e sarebbe sbagliato. Con cinque colonne vale ancora di piu'.
   */
  it("sulle calorie mostra i numeri e non dichiara un vincitore", () => {
    const [riga] = buildMultiComparison(
      persona("io", { kcal: 1800 }),
      [
        persona("anna", { kcal: 2600 }, { ...niente, calories: true }),
        persona("bea", { kcal: 3100 }, { ...niente, calories: true }),
      ],
    );

    expect(riga.ranked).toBe(false);
    expect(primi(riga.cells)).toEqual([]);
    expect(valore(riga.cells, "bea")).toBe(3100);
  });

  /**
   * "Pesi sei chili piu' del tuo amico" non e' un'informazione utile a
   * nessuno. Vale a maggior ragione fra cinque persone.
   */
  it("il peso non e' una metrica confrontabile", () => {
    const righe = buildMultiComparison(persona("io"), [persona("anna")]);

    expect(righe.map((r) => r.metric)).not.toContain("weight");
  });

  it("un numero mancante non e' un pareggio ne' un ultimo posto", () => {
    const [riga] = buildMultiComparison(
      persona("io", { steps: 8000 }),
      [persona("anna", { steps: null }, { ...niente, steps: true })],
    );

    // Dire "sei avanti" perche' l'altro non ha registrato i passi sarebbe una
    // bugia detta con un numero: con un solo dato non c'e' classifica.
    expect(primi(riga.cells)).toEqual([]);
    expect(valore(riga.cells, "anna")).toBeNull();
  });

  it("una metrica che non condivide nessuno non compare per niente", () => {
    const righe = buildMultiComparison(
      persona("io", { kcal: 2000, steps: 8000, workouts: 1 }),
      [
        persona("anna", { kcal: 2200, steps: 7000, workouts: 2 }, { ...niente, steps: true }),
        persona("bea", { kcal: 2400, steps: 6000, workouts: 3 }, { ...niente, steps: true }),
      ],
    );

    expect(righe.map((r) => r.metric)).toEqual(["steps"]);
  });

  it("con tutto condiviso tiene l'ordine e classifica solo l'attivita'", () => {
    const righe = buildMultiComparison(
      persona("io", { kcal: 2000, steps: 8000, workouts: 1 }),
      [persona("anna", { kcal: 2200, steps: 7000, workouts: 2 })],
    );

    expect(righe.map((r) => [r.metric, primi(r.cells)])).toEqual([
      ["kcal", []],
      ["steps", ["io"]],
      ["workouts", ["anna"]],
    ]);
  });

  /**
   * La regola nuova del confronto a piu' persone. Nascondere i passi perche'
   * uno dei quattro non li condivide punirebbe gli altri tre, che li avevano
   * condivisi apposta.
   */
  it("basta uno che condivide perche' la riga esista, gli altri hanno un trattino", () => {
    const [riga] = buildMultiComparison(
      persona("io", { steps: 8000 }),
      [
        persona("anna", { steps: 12000 }, { ...niente, steps: true }),
        persona("bea", { steps: 20000 }, niente),
      ],
    );

    expect(valore(riga.cells, "anna")).toBe(12000);
    // Bea non condivide: il suo numero non si vede, e nemmeno vince.
    expect(valore(riga.cells, "bea")).toBeNull();
    expect(primi(riga.cells)).toEqual(["anna"]);
  });

  /**
   * Le mie condivisioni dicono cosa pubblico agli altri, non cosa ho il
   * diritto di vedere di me stesso.
   */
  it("i miei numeri li vedo anche se non condivido niente", () => {
    const [riga] = buildMultiComparison(
      persona("io", { steps: 8000 }, niente),
      [persona("anna", { steps: 4000 }, { ...niente, steps: true })],
    );

    expect(valore(riga.cells, "io")).toBe(8000);
  });

  it("regge quattro persone piu' me", () => {
    const [riga] = buildMultiComparison(
      persona("io", { steps: 8000 }),
      [
        persona("anna", { steps: 12000 }, { ...niente, steps: true }),
        persona("bea", { steps: 9000 }, { ...niente, steps: true }),
        persona("carlo", { steps: 15000 }, { ...niente, steps: true }),
        persona("dino", { steps: 3000 }, { ...niente, steps: true }),
      ],
    );

    expect(riga.cells).toHaveLength(5);
    expect(primi(riga.cells)).toEqual(["carlo"]);
  });
});

/**
 * In palestra il confronto e' legittimo, ed e' l'unica differenza rispetto
 * alle calorie: un carico si allena, un fabbisogno no.
 */
describe("il confronto in palestra", () => {
  it("classifica il volume e il carico massimo", () => {
    const righe = buildGymComparison(
      persona("io", {}, tutte, [esercizio("Panca piana")]),
      [
        persona("anna", {}, tutte, [
          esercizio("Panca piana", { volumeKg: 3400, topWeightKg: 70 }),
        ]),
      ],
    );

    expect(righe).toHaveLength(1);
    expect(primi(righe[0].volume)).toEqual(["anna"]);
    // Il volume e il carico massimo sono due domande diverse, e possono avere
    // due risposte diverse: piu' ripetizioni leggere fanno piu' volume.
    expect(primi(righe[0].topWeight)).toEqual(["io"]);
  });

  it("un esercizio che uno non ha fatto e' un trattino, non uno zero", () => {
    const righe = buildGymComparison(
      persona("io", {}, tutte, [esercizio("Panca piana")]),
      [persona("anna", {}, tutte, [esercizio("Squat")])],
    );

    const panca = righe.find((r) => r.exercise === "Panca piana");
    expect(valore(panca!.volume, "anna")).toBeNull();
    // Con un solo dato non c'e' classifica: non ho battuto nessuno, ho fatto
    // un esercizio che l'altro non ha fatto.
    expect(primi(panca!.volume)).toEqual([]);
  });

  it("parte dai miei esercizi e poi aggiunge i loro", () => {
    const righe = buildGymComparison(
      persona("io", {}, tutte, [esercizio("Panca piana"), esercizio("Squat")]),
      [persona("anna", {}, tutte, [esercizio("Stacco"), esercizio("Squat")])],
    );

    expect(righe.map((r) => r.exercise)).toEqual([
      "Panca piana",
      "Squat",
      "Stacco",
    ]);
  });

  it("senza palestra condivisa non c'e' niente da confrontare", () => {
    const righe = buildGymComparison(persona("io"), [persona("anna")]);

    expect(righe).toEqual([]);
  });

  it("a corpo libero il carico massimo manca ma il volume no", () => {
    const righe = buildGymComparison(
      persona("io", {}, tutte, [
        esercizio("Trazioni", { volumeKg: 0, topWeightKg: null }),
      ]),
      [
        persona("anna", {}, tutte, [
          esercizio("Trazioni", { volumeKg: 0, topWeightKg: null }),
        ]),
      ],
    );

    expect(primi(righe[0].topWeight)).toEqual([]);
    // Zero volume da entrambe le parti resta un pareggio vero: e' un numero
    // registrato, non un dato che manca.
    expect(primi(righe[0].volume)).toEqual(["io", "anna"]);
  });
});
