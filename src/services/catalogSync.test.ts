import { createTestDb } from "@/src/db/__testing__/betterSqliteAdapter";
import { __setDbForTesting } from "@/src/db/index";
import { runMigrations } from "@/src/db/migrations";
import {
  createExercise,
  getExercise,
  searchExercises,
  setExerciseBanned,
  setExerciseDislike,
} from "@/src/db/queries/exercises";
import { getSetting } from "@/src/db/queries/settings";
import type { LocalDatabase } from "@/src/db/sqliteAdapter";
import { pullExercises } from "@/src/services/catalogSync";
import { CATALOG_EXERCISES_CURSOR } from "@/src/services/syncMarkers";
import { useAccountStore } from "@/src/stores/accountStore";

jest.mock("@/src/api/config", () => ({
  API_URL: "https://esempio.tld/api",
  API_TIMEOUT_MS: 1000,
  hasBackend: () => true,
}));

// Il prefisso `mock` non e' vezzo: jest.mock viene issato in cima al file e
// senza quel prefisso rifiuta di leggere una variabile dichiarata dopo.
const mockApiRequest = jest.fn();
jest.mock("@/src/api/client", () => ({
  apiRequest: (...args: unknown[]) => mockApiRequest(...args),
  setAuthTokenProvider: jest.fn(),
}));

let db: LocalDatabase;

beforeEach(async () => {
  jest.clearAllMocks();
  db = createTestDb();
  await runMigrations(db);
  __setDbForTesting(db);
  useAccountStore.setState({ token: "token-valido", profile: null });
});

afterEach(() => __setDbForTesting(null));

/** Una voce viva del catalogo. */
const voce = (over: Record<string, unknown> = {}) => ({
  uid: "ex-panca-piana-bilanciere",
  deletedAt: null,
  name: "Panca piana",
  nameNorm: "panca piana",
  muscleGroup: "petto",
  secondaryMuscles: "tricipiti,spalle",
  equipment: "bilanciere,panca",
  instructions: "Scapole addotte.",
  photo: null,
  mine: false,
  ...over,
});

/** Una pagina sola, senza seguito: e' il caso normale. */
const pagina = (voci: unknown[], cursore = { since: "2026-09-08T10:00:00+00:00", afterId: 7 }) => ({
  data: voci,
  cursor: voci.length > 0 ? cursore : null,
  next: null,
});

describe("pullExercises, l'aggancio di una riga", () => {
  it("inserisce una voce che qui non c'e'", async () => {
    mockApiRequest.mockResolvedValue(pagina([voce()]));

    expect(await pullExercises()).toBe(1);

    const [riga] = await searchExercises({ term: "panca" });
    expect(riga.name).toBe("Panca piana");
    expect(riga.catalog_uid).toBe("ex-panca-piana-bilanciere");
    // Voce di catalogo, non roba inventata da chi usa questo telefono.
    expect(riga.is_custom).toBe(0);
    expect(riga.instructions).toBe("Scapole addotte.");
    expect(JSON.parse(riga.equipment ?? "[]")).toEqual(["bilanciere", "panca"]);
    expect(JSON.parse(riga.secondary_muscles ?? "[]")).toEqual([
      "tricipiti",
      "spalle",
    ]);
  });

  /**
   * Il difetto che tutta questa fase esiste per chiudere. Prima l'aggancio era
   * sul nome: rinominata dal pannello, la voce arrivava come nuova e quella
   * col nome vecchio restava. Una rinomina, un doppione per telefono.
   */
  it("rinomina invece di duplicare, riconoscendo l'uid", async () => {
    await createExercise({
      name: "Panca piana",
      muscleGroup: "petto",
      secondaryMuscles: [],
      equipment: ["bilanciere"],
      catalogUid: "ex-panca-piana-bilanciere",
      isCustom: false,
    });

    mockApiRequest.mockResolvedValue(
      pagina([voce({ name: "Panca piana con bilanciere", nameNorm: "panca piana con bilanciere" })]),
    );

    await pullExercises();

    const righe = await searchExercises({ term: "panca" });
    expect(righe).toHaveLength(1);
    expect(righe[0].name).toBe("Panca piana con bilanciere");
  });

  /**
   * Il primo pull dopo l'aggiornamento: le righe gia' installate non hanno
   * l'uid, si riconoscono dal nome, e da qui in poi hanno l'uid.
   */
  it("aggancia per nome una riga senza uid, e le da' l'uid", async () => {
    const id = await createExercise({
      name: "panca  piana",
      muscleGroup: "petto",
      secondaryMuscles: [],
      equipment: ["bilanciere"],
      isCustom: false,
    });
    mockApiRequest.mockResolvedValue(pagina([voce()]));

    await pullExercises();

    expect(await searchExercises({ term: "panca" })).toHaveLength(1);
    expect((await getExercise(id))?.catalog_uid).toBe(
      "ex-panca-piana-bilanciere",
    );
  });

  /**
   * Il difetto del brief: una riga che ha gia' un uid DIVERSO non e' "senza
   * uid", e' l'identita' di un'ALTRA voce di catalogo. La sequenza che morde:
   * il pannello rinomina X (che libera il nome), Y prende quel nome, la
   * stessa pagina porta entrambe. Agganciare Y per nome alla riga di X le
   * scambierebbe contenuto e identita' sotto silenzio - X resterebbe
   * orfana (il suo tombstone diventerebbe un no-op) e la riga che gli
   * allenamenti passati nominano sarebbe diventata un altro esercizio.
   */
  it("non aggancia per nome una riga che ha gia' un uid diverso", async () => {
    const id = await createExercise({
      name: "Panca piana",
      muscleGroup: "petto",
      secondaryMuscles: [],
      equipment: ["bilanciere"],
      instructions: "vecchio testo",
      catalogUid: "ex-altro",
      isCustom: false,
    });

    mockApiRequest.mockResolvedValue(pagina([voce()]));

    expect(await pullExercises()).toBe(1);

    const righe = await searchExercises({ term: "panca" });
    expect(righe).toHaveLength(2);

    // La riga vecchia resta la sua: uid e contenuto intatti.
    const vecchia = await getExercise(id);
    expect(vecchia?.catalog_uid).toBe("ex-altro");
    expect(vecchia?.instructions).toBe("vecchio testo");

    // La voce in arrivo e' entrata come riga NUOVA, non come aggiornamento
    // della vecchia.
    const nuova = righe.find((r) => r.id !== id);
    expect(nuova?.catalog_uid).toBe("ex-panca-piana-bilanciere");
  });
});

describe("pullExercises, quel che non tocca", () => {
  /** Regola 2: il catalogo scrive la descrizione, non i giudizi. */
  it("i giudizi personali sopravvivono a un pull che riscrive tutto il resto", async () => {
    const id = await createExercise({
      name: "Panca piana",
      muscleGroup: "petto",
      secondaryMuscles: [],
      equipment: ["bilanciere"],
      notes: "spalla destra",
      catalogUid: "ex-panca-piana-bilanciere",
      isCustom: false,
    });
    await setExerciseDislike(id, 2);
    await setExerciseBanned(id, true);
    mockApiRequest.mockResolvedValue(
      pagina([voce({ instructions: "Testo nuovo." })]),
    );

    await pullExercises();

    const riga = await getExercise(id);
    expect(riga?.instructions).toBe("Testo nuovo.");
    expect(riga?.notes).toBe("spalla destra");
    expect(riga?.dislike_level).toBe(2);
    expect(riga?.is_banned).toBe(1);
  });

  /** Regola 2: una riga `is_custom = 1` e' dell'utente, e non si tocca mai. */
  it("non tocca una riga dell'utente, nemmeno se l'uid combacia", async () => {
    const id = await createExercise({
      name: "La mia panca",
      muscleGroup: "petto",
      secondaryMuscles: [],
      equipment: ["bilanciere"],
      catalogUid: "ex-panca-piana-bilanciere",
      // Il default: un esercizio scritto a mano e' `is_custom = 1`.
    });
    mockApiRequest.mockResolvedValue(pagina([voce()]));

    await pullExercises();

    const riga = await getExercise(id);
    expect(riga?.name).toBe("La mia panca");
    expect(riga?.instructions).toBeNull();
    expect(riga?.catalog_uid).toBe("ex-panca-piana-bilanciere");
  });

  /**
   * L'altra meta' della regola: una riga dell'utente che l'uid non ce l'ha
   * ANCORA (agganciata per nome) lo riceve comunque - serve a un tombstone
   * futuro per sapere di quale riga parla - ma il contenuto resta il suo.
   * Spostare il controllo `is_custom` PRIMA dell'assegnazione dell'uid e' lo
   * sbaglio naturale, ed e' quello che lascerebbe la riga senza identita'.
   */
  it("da' l'uid a una riga dell'utente senza uid, ma non ne scrive il contenuto", async () => {
    const id = await createExercise({
      name: "Panca piana",
      muscleGroup: "schiena",
      secondaryMuscles: [],
      equipment: ["manubri"],
      instructions: "la faccio a modo mio",
      // Nessun catalogUid: si aggancia per nome, come una riga pre-migrazione.
      // Il default resta `is_custom = 1`.
    });
    mockApiRequest.mockResolvedValue(pagina([voce()]));

    await pullExercises();

    const riga = await getExercise(id);
    expect(riga?.muscle_group).toBe("schiena");
    expect(riga?.instructions).toBe("la faccio a modo mio");
    expect(riga?.catalog_uid).toBe("ex-panca-piana-bilanciere");
  });

  /**
   * Il catalogo lo scrivono altri telefoni e il gestionale: un gruppo che
   * questa versione dell'app non conosce non deve entrare in colonna e
   * girare come se fosse buono.
   */
  it("scarta una voce il cui gruppo muscolare non esiste", async () => {
    mockApiRequest.mockResolvedValue(pagina([voce({ muscleGroup: "branchie" })]));

    expect(await pullExercises()).toBe(0);
    expect(await searchExercises({ term: "panca" })).toHaveLength(0);
  });

  it("tiene solo gli attrezzi e i muscoli che conosce", async () => {
    mockApiRequest.mockResolvedValue(
      pagina([
        voce({
          equipment: "bilanciere,astronave",
          secondaryMuscles: "tricipiti,branchie",
        }),
      ]),
    );

    await pullExercises();

    const [riga] = await searchExercises({ term: "panca" });
    expect(JSON.parse(riga.equipment ?? "[]")).toEqual(["bilanciere"]);
    expect(JSON.parse(riga.secondary_muscles ?? "[]")).toEqual(["tricipiti"]);
  });
});

describe("pullExercises, una voce tolta dal catalogo", () => {
  /**
   * Regola 3. Cancellarla porterebbe via il nome a ogni allenamento passato
   * che la nominava, che e' quel che `deleteRoutine` evita non cancellando i
   * giorni.
   */
  it("la riga resta e diventa dell'utente", async () => {
    const id = await createExercise({
      name: "Panca piana",
      muscleGroup: "petto",
      secondaryMuscles: [],
      equipment: ["bilanciere"],
      catalogUid: "ex-panca-piana-bilanciere",
      isCustom: false,
    });
    mockApiRequest.mockResolvedValue(
      pagina([{ uid: "ex-panca-piana-bilanciere", deletedAt: "2026-09-08T09:00:00+00:00" }]),
    );

    expect(await pullExercises()).toBe(1);

    const riga = await getExercise(id);
    expect(riga).not.toBeNull();
    expect(riga?.is_custom).toBe(1);
    expect(riga?.catalog_uid).toBe("ex-panca-piana-bilanciere");
  });

  /**
   * Un tombstone per una voce che qui non c'e' non e' un errore. Il solo
   * `toBe(0)` non lo distingue da un giro andato in eccezione - anche il
   * `catch` esterno torna 0 - quindi si pretende anche che il cursore sia
   * stato scritto: succede solo sul percorso normale, mai su quello che
   * solleva.
   */
  it("un tombstone sconosciuto non fa niente e non solleva", async () => {
    mockApiRequest.mockResolvedValue(
      pagina([{ uid: "ex-mai-vista", deletedAt: "2026-09-08T09:00:00+00:00" }]),
    );

    expect(await pullExercises()).toBe(0);
    expect(await getSetting(CATALOG_EXERCISES_CURSOR)).not.toBeNull();
  });
});

describe("pullExercises, il cursore", () => {
  it("il primo pull non manda `since`", async () => {
    mockApiRequest.mockResolvedValue(pagina([voce()]));

    await pullExercises();

    expect(mockApiRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "get",
        path: "/catalog/exercises",
        params: {},
      }),
    );
  });

  it("salva il cursore e lo rimanda al giro dopo", async () => {
    mockApiRequest.mockResolvedValue(
      pagina([voce()], { since: "2026-09-08T10:00:00+00:00", afterId: 42 }),
    );
    await pullExercises();

    expect(await getSetting(CATALOG_EXERCISES_CURSOR)).toBe(
      '{"since":"2026-09-08T10:00:00+00:00","afterId":42}',
    );

    mockApiRequest.mockResolvedValue(pagina([]));
    await pullExercises();

    expect(mockApiRequest).toHaveBeenLastCalledWith(
      expect.objectContaining({
        params: { since: "2026-09-08T10:00:00+00:00", afterId: "42" },
      }),
    );
  });

  /**
   * Il difetto chiuso lato server nel task 4, visto da qui: si salva `cursor`
   * e non `next`. Con `next` l'ultima pagina non avanzava il segnaposto e la
   * coda del catalogo si rileggeva a ogni giro.
   */
  it("avanza il cursore anche quando non c'e' altro da chiedere", async () => {
    mockApiRequest.mockResolvedValue({
      data: [voce()],
      cursor: { since: "2026-09-08T11:00:00+00:00", afterId: 9 },
      next: null,
    });

    await pullExercises();

    expect(await getSetting(CATALOG_EXERCISES_CURSOR)).toContain('"afterId":9');
  });

  it("continua finche' il server dice che c'e' altro", async () => {
    mockApiRequest
      .mockResolvedValueOnce({
        data: [voce()],
        cursor: { since: "2026-09-08T10:00:00+00:00", afterId: 1 },
        next: { since: "2026-09-08T10:00:00+00:00", afterId: 1 },
      })
      .mockResolvedValueOnce({
        data: [voce({ uid: "ex-squat-bilanciere", name: "Squat", nameNorm: "squat", muscleGroup: "quadricipiti" })],
        cursor: { since: "2026-09-08T10:00:01+00:00", afterId: 2 },
        next: null,
      });

    expect(await pullExercises()).toBe(2);
    expect(mockApiRequest).toHaveBeenCalledTimes(2);
    expect(mockApiRequest).toHaveBeenLastCalledWith(
      expect.objectContaining({
        params: { since: "2026-09-08T10:00:00+00:00", afterId: "1" },
      }),
    );
  });

  /**
   * Un cursore illeggibile - scritto da una versione precedente, o corrotto -
   * riparte da zero. Al massimo costa un pull completo, che e' idempotente.
   */
  it("un cursore illeggibile riparte da zero", async () => {
    await db.runAsync(
      "INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)",
      [CATALOG_EXERCISES_CURSOR, "non-json", "2026-09-08T00:00:00.000Z"],
    );
    mockApiRequest.mockResolvedValue(pagina([]));

    await pullExercises();

    expect(mockApiRequest).toHaveBeenCalledWith(
      expect.objectContaining({ params: {} }),
    );
  });

  /**
   * La resistenza che il commento in `pullExercises` promette: il cursore si
   * scrive a OGNI pagina, non alla fine del giro. Se la seconda pagina fallisce,
   * quella della prima deve essere gia' sul disco - altrimenti un giro
   * interrotto a meta' ripartirebbe da zero invece che da dove era arrivato.
   */
  it("il cursore della prima pagina resta anche se la seconda fallisce", async () => {
    mockApiRequest
      .mockResolvedValueOnce({
        data: [voce()],
        cursor: { since: "2026-09-08T10:00:00+00:00", afterId: 1 },
        next: { since: "2026-09-08T10:00:00+00:00", afterId: 1 },
      })
      .mockRejectedValueOnce(new Error("rete assente"));

    // Il giro nel complesso fallisce - il `catch` esterno torna 0 - ma il
    // cursore della prima pagina, gia' scritto prima dell'eccezione, resta.
    expect(await pullExercises()).toBe(0);
    expect(await getSetting(CATALOG_EXERCISES_CURSOR)).toBe(
      '{"since":"2026-09-08T10:00:00+00:00","afterId":1}',
    );
  });

  /**
   * `MAX_PAGES` e' l'unico argine fra un server che dice sempre "c'e' altro"
   * e un ciclo che non finisce mai. Un server che tornasse una pagina piena
   * col cursore fermo deve fermarsi comunque al tetto.
   */
  it("si ferma dopo un numero massimo di pagine anche se il server dice sempre che c'e' altro", async () => {
    mockApiRequest.mockResolvedValue({
      data: [voce()],
      cursor: { since: "2026-09-08T10:00:00+00:00", afterId: 1 },
      next: { since: "2026-09-08T10:00:00+00:00", afterId: 1 },
    });

    await pullExercises();

    expect(mockApiRequest).toHaveBeenCalledTimes(50);
  });
});

describe("pullExercises, quando non si puo' fare", () => {
  it("senza account non chiede niente", async () => {
    useAccountStore.setState({ token: null, profile: null });

    expect(await pullExercises()).toBe(0);
    expect(mockApiRequest).not.toHaveBeenCalled();
  });

  /** Senza rete la palestra deve funzionare com'e' sempre funzionata. */
  it("un errore di rete non solleva e non avanza il cursore", async () => {
    mockApiRequest.mockRejectedValue(new Error("rete assente"));

    expect(await pullExercises()).toBe(0);
    expect(await getSetting(CATALOG_EXERCISES_CURSOR)).toBeNull();
  });
});
