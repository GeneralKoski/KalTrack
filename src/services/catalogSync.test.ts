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
import {
  createFood,
  getFood,
  searchFoods,
  toggleFoodFavorite,
} from "@/src/db/queries/foods";
import { getSetting } from "@/src/db/queries/settings";
import type { LocalDatabase } from "@/src/db/sqliteAdapter";
import { EMPTY_NUTRIENTS } from "@/src/domain/nutrition";
import { pullExercises, pullFoods, syncCatalog } from "@/src/services/catalogSync";
import { catalogPhotoPath } from "@/src/services/photoSync";
import {
  CATALOG_EXERCISES_CURSOR,
  CATALOG_FOODS_CURSOR,
} from "@/src/services/syncMarkers";
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

const alimento = (over: Record<string, unknown> = {}) => ({
  uid: "food-riso",
  deletedAt: null,
  name: "Riso",
  nameNorm: "riso",
  brand: null,
  barcode: null,
  offId: null,
  kcal: 358,
  protein: 7,
  carbs: 79,
  sugars: 0,
  fat: 0.6,
  saturatedFat: 0.2,
  fiber: 1,
  salt: 0,
  isLiquid: false,
  defaultServingG: 80,
  servingLabel: "1 porzione = 80 g",
  image: null,
  mine: false,
  ...over,
});

describe("pullFoods", () => {
  it("inserisce un alimento che qui non c'e', come voce di catalogo", async () => {
    mockApiRequest.mockResolvedValue(pagina([alimento()]));

    expect(await pullFoods()).toBe(1);

    const [riga] = await searchFoods("riso");
    expect(riga.name).toBe("Riso");
    expect(riga.kcal).toBe(358);
    expect(riga.catalog_uid).toBe("food-riso");
    // Marcatore di catalogo: `searchMyFoods` filtra `source != 'seed'`, quindi
    // "In libreria" resta "quelli che ho aggiunto io".
    expect(riga.source).toBe("seed");
    expect(riga.serving_label).toBe("1 porzione = 80 g");
  });

  /**
   * `barcode` e `off_id` sono identita': sull'AGGIORNAMENTO il catalogo non li
   * tocca mai (vedi il test piu' sotto), ma sull'INSERIMENTO non c'e' niente
   * da proteggere - la riga non esiste ancora. Ometterli farebbe arrivare un
   * alimento di catalogo senza codice a barre: la scansione successiva non lo
   * troverebbe in libreria e ne creerebbe un doppione da OpenFoodFacts (§ Il
   * codice a barre in CLAUDE.md).
   */
  it("l'inserimento porta anche codice a barre e provenienza OFF", async () => {
    mockApiRequest.mockResolvedValue(
      pagina([alimento({ barcode: "8001234567890", offId: "off-riso" })]),
    );

    await pullFoods();

    const [riga] = await searchFoods("riso");
    expect(riga.barcode).toBe("8001234567890");
    expect(riga.off_id).toBe("off-riso");
  });

  /**
   * Il PERCORSO si scrive subito, i byte arrivano dopo (come per gli
   * esercizi): `image_uri` deve portare il prefisso dell'archivio di
   * catalogo, non il nome nudo del file - altrimenti `isCatalogPhoto` non lo
   * riconoscerebbe e la foto non comparirebbe mai, senza errori a schermo.
   */
  it("il percorso della foto passa da catalogPhotoPath, non il nome nudo", async () => {
    mockApiRequest.mockResolvedValue(pagina([alimento({ image: "riso.jpg" })]));

    await pullFoods();

    const [riga] = await searchFoods("riso");
    expect(riga.image_uri).toBe(catalogPhotoPath("riso.jpg"));
  });

  /**
   * `!= null` e non `!== null` (vedi il commento in `catalogSync.ts`): un
   * `deletedAt` assente non deve passare per un tombstone. Con `alimento()`
   * intero (nome e valori compresi) e nessuna riga preesistente, un
   * `deletedAt: undefined` trattato come tombstone troverebbe `perUid` nullo
   * e uscirebbe con `false` senza inserire niente.
   */
  it("un deletedAt assente non passa per un tombstone", async () => {
    mockApiRequest.mockResolvedValue(pagina([alimento({ deletedAt: undefined })]));

    expect(await pullFoods()).toBe(1);

    const [riga] = await searchFoods("riso");
    expect(riga.source).toBe("seed");
  });

  it("riconosce l'uid e rinomina invece di duplicare", async () => {
    await createFood({
      name: "Riso",
      nutrients: { ...EMPTY_NUTRIENTS, kcal: 358 },
      source: "seed",
      catalogUid: "food-riso",
    });
    mockApiRequest.mockResolvedValue(
      pagina([alimento({ name: "Riso bianco", nameNorm: "riso bianco" })]),
    );

    await pullFoods();

    const righe = await searchFoods("riso");
    expect(righe).toHaveLength(1);
    expect(righe[0].name).toBe("Riso bianco");
  });

  it("aggancia per nome un seed senza uid, e gli da' l'uid", async () => {
    const id = await createFood({
      name: "riso",
      nutrients: { ...EMPTY_NUTRIENTS, kcal: 350 },
      source: "seed",
    });
    mockApiRequest.mockResolvedValue(pagina([alimento()]));

    await pullFoods();

    expect(await searchFoods("riso")).toHaveLength(1);
    expect((await getFood(id))?.catalog_uid).toBe("food-riso");
    expect((await getFood(id))?.kcal).toBe(358);
  });

  /**
   * Un alimento dell'utente col nome uguale non si riscrive e non si
   * affianca: i suoi valori li ha corretti lui, e una seconda riga con lo
   * stesso nome in elenco sarebbe indistinguibile.
   */
  it("non tocca un alimento dell'utente che porta lo stesso nome", async () => {
    const id = await createFood({
      name: "Riso",
      nutrients: { ...EMPTY_NUTRIENTS, kcal: 111 },
      source: "user",
    });
    mockApiRequest.mockResolvedValue(pagina([alimento()]));

    await pullFoods();

    expect(await searchFoods("riso")).toHaveLength(1);
    expect((await getFood(id))?.kcal).toBe(111);
  });

  /**
   * L'uid si scrive PRIMA del veto di proprieta', non dopo: una riga
   * dell'utente agganciata per nome riceve comunque l'uid, cosi' un
   * tombstone futuro sa di quale riga parla. Invertire l'ordine (veto prima
   * della scrittura) lascerebbe la riga senza identita' e un tombstone
   * successivo diventerebbe un no-op silenzioso su una riga che era proprio
   * quella di cui parlava - lo stesso difetto chiuso per gli esercizi.
   */
  it("da' l'uid a un alimento dell'utente senza uid, ma non ne scrive il contenuto", async () => {
    const id = await createFood({
      name: "Riso",
      nutrients: { ...EMPTY_NUTRIENTS, kcal: 111 },
      source: "user",
      // Nessun catalogUid: si aggancia per nome, come una riga pre-migrazione.
    });
    mockApiRequest.mockResolvedValue(pagina([alimento()]));

    await pullFoods();

    const riga = await getFood(id);
    expect(riga?.catalog_uid).toBe("food-riso");
    expect(riga?.kcal).toBe(111);
  });

  /**
   * `barcode` e `off_id` sono identita' e non contenuto, e il preferito e' uno
   * stato d'uso di questo telefono: e' la stessa regola per cui `updateFood`
   * non li tocca.
   */
  it("non tocca codice a barre, provenienza e preferito", async () => {
    const id = await createFood({
      name: "Riso",
      nutrients: { ...EMPTY_NUTRIENTS, kcal: 350 },
      source: "seed",
      barcode: "8001234567890",
      offId: "off-riso",
      catalogUid: "food-riso",
    });
    await toggleFoodFavorite(id);
    mockApiRequest.mockResolvedValue(pagina([alimento()]));

    await pullFoods();

    const riga = await getFood(id);
    expect(riga?.kcal).toBe(358);
    expect(riga?.barcode).toBe("8001234567890");
    expect(riga?.off_id).toBe("off-riso");
    expect(riga?.is_favorite).toBe(1);
  });

  it("una voce tolta dal catalogo resta e diventa dell'utente", async () => {
    const id = await createFood({
      name: "Riso",
      nutrients: { ...EMPTY_NUTRIENTS, kcal: 358 },
      source: "seed",
      catalogUid: "food-riso",
    });
    mockApiRequest.mockResolvedValue(
      pagina([{ uid: "food-riso", deletedAt: "2026-09-08T09:00:00+00:00" }]),
    );

    expect(await pullFoods()).toBe(1);

    const riga = await getFood(id);
    expect(riga).not.toBeNull();
    expect(riga?.source).toBe("user");
  });

  /**
   * L'altra meta' della guardia sul tombstone: non basta trovare la riga per
   * uid, dev'essere anche una riga del catalogo. Una riga con provenienza
   * OFF che ha ricevuto l'uid per fallback sul nome non e' `source = 'seed'`,
   * e un tombstone su di lei non deve toccarla - cancellare la provenienza
   * `'off'`/`'ai'` sarebbe un giudizio che il catalogo non ha titolo di dare.
   */
  it("un tombstone non tocca una riga che non e' del catalogo", async () => {
    const id = await createFood({
      name: "Riso",
      nutrients: { ...EMPTY_NUTRIENTS, kcal: 111 },
      source: "off",
      catalogUid: "food-riso",
    });
    mockApiRequest.mockResolvedValue(
      pagina([{ uid: "food-riso", deletedAt: "2026-09-08T09:00:00+00:00" }]),
    );

    expect(await pullFoods()).toBe(0);

    const riga = await getFood(id);
    expect(riga?.source).toBe("off");
  });

  /**
   * Non basta `toBe(0)`: anche il `catch` esterno di `pullFoods` torna 0, e
   * un tombstone sconosciuto che sollevasse un'eccezione ingoiata darebbe lo
   * stesso numero. Il cursore scritto e' quel che distingue il no-op vero da
   * un errore incassato - succede solo sul percorso normale.
   */
  it("un tombstone sconosciuto non fa niente e non solleva", async () => {
    mockApiRequest.mockResolvedValue(
      pagina([{ uid: "food-mai-vista", deletedAt: "2026-09-08T09:00:00+00:00" }]),
    );

    expect(await pullFoods()).toBe(0);
    expect(await getSetting(CATALOG_FOODS_CURSOR)).not.toBeNull();
  });

  /**
   * `voce.kcal == null` e non `=== undefined`: la colonna `kcal` e' `NOT
   * NULL`, quindi un `kcal: null` non filtrato qui arriverebbe fino
   * all'INSERT, SQLite solleverebbe e il giro fallirebbe - la stessa trappola
   * del tombstone ignoto: la pagina si ripeterebbe identica per sempre. Oggi
   * il server non puo' produrlo (colonna non nullable, castata a float), ma
   * e' un confine che l'app non controlla.
   */
  it("un kcal nullo non entra, e non blocca il cursore", async () => {
    mockApiRequest.mockResolvedValue(pagina([alimento({ kcal: null })]));

    expect(await pullFoods()).toBe(0);
    expect(await searchFoods("riso")).toHaveLength(0);
    expect(await getSetting(CATALOG_FOODS_CURSOR)).not.toBeNull();
  });

  it("legge il proprio cursore, non quello degli esercizi", async () => {
    mockApiRequest.mockResolvedValue(
      pagina([alimento()], { since: "2026-09-08T12:00:00+00:00", afterId: 3 }),
    );

    await pullFoods();

    expect(await getSetting(CATALOG_FOODS_CURSOR)).toContain('"afterId":3');
    expect(await getSetting(CATALOG_EXERCISES_CURSOR)).toBeNull();
    expect(mockApiRequest).toHaveBeenCalledWith(
      expect.objectContaining({ path: "/catalog/foods" }),
    );
  });

  it("senza account non chiede niente", async () => {
    useAccountStore.setState({ token: null, profile: null });

    expect(await pullFoods()).toBe(0);
    expect(mockApiRequest).not.toHaveBeenCalled();
  });

  it("un errore di rete non solleva", async () => {
    mockApiRequest.mockRejectedValue(new Error("rete assente"));

    expect(await pullFoods()).toBe(0);
  });

  /**
   * Il difetto che la guardia sul fallback chiude, ed e' lo stesso trovato
   * dalla review del task 6: una riga che porta gia' un uid diverso non e'
   * questa voce. Senza la guardia, la riga di X si ritroverebbe con l'uid e i
   * valori di Y, e le ricette che la nominano parlerebbero di un altro
   * alimento.
   */
  it("non ruba una riga che porta gia' un altro uid", async () => {
    const id = await createFood({
      name: "Riso",
      nutrients: { ...EMPTY_NUTRIENTS, kcal: 350 },
      source: "seed",
      catalogUid: "food-altro",
    });
    mockApiRequest.mockResolvedValue(pagina([alimento()]));

    await pullFoods();

    // La riga di prima e' intatta...
    const vecchia = await getFood(id);
    expect(vecchia?.catalog_uid).toBe("food-altro");
    expect(vecchia?.kcal).toBe(350);
    // ...e la voce nuova e' entrata come riga sua.
    expect(await searchFoods("riso")).toHaveLength(2);
  });

  /** Come per gli esercizi: il cursore si scrive a ogni pagina, non alla fine. */
  it("tiene il cursore della pagina applicata se la successiva cade", async () => {
    mockApiRequest
      .mockResolvedValueOnce({
        data: [alimento()],
        cursor: { since: "2026-09-08T12:00:00+00:00", afterId: 1 },
        next: { since: "2026-09-08T12:00:00+00:00", afterId: 1 },
      })
      .mockRejectedValueOnce(new Error("rete caduta"));

    await pullFoods();

    expect(await getSetting(CATALOG_FOODS_CURSOR)).toContain('"afterId":1');
  });

  /** Il tetto e' l'unica cosa fra un server che sbaglia e un giro infinito. */
  it("non fa piu' di MAX_PAGES giri", async () => {
    const cursore = { since: "2026-09-08T12:00:00+00:00", afterId: 1 };
    mockApiRequest.mockResolvedValue({
      data: [alimento()],
      cursor: cursore,
      next: cursore,
    });

    await pullFoods();

    expect(mockApiRequest).toHaveBeenCalledTimes(50);
  });
});

describe("syncCatalog", () => {
  it("fa i due pull e somma quel che hanno toccato", async () => {
    mockApiRequest
      .mockResolvedValueOnce(pagina([voce()]))
      .mockResolvedValueOnce(pagina([alimento()]));

    expect(await syncCatalog()).toBe(2);
    expect(mockApiRequest).toHaveBeenCalledTimes(2);
  });

  /**
   * Il secondo pull deve partire comunque: gli alimenti non devono restare
   * indietro perche' il catalogo degli esercizi non ha risposto.
   */
  it("il secondo pull parte anche se il primo e' andato male", async () => {
    mockApiRequest
      .mockRejectedValueOnce(new Error("rete assente"))
      .mockResolvedValueOnce(pagina([alimento()]));

    expect(await syncCatalog()).toBe(1);
  });
});
