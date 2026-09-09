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
import { getSetting, setSetting } from "@/src/db/queries/settings";
import * as taxonomyQueries from "@/src/db/queries/taxonomies";
import type { LocalDatabase } from "@/src/db/sqliteAdapter";
import { EMPTY_NUTRIENTS } from "@/src/domain/nutrition";
import { i18n } from "@/src/i18n";
import {
  amendExerciseSubmission,
  amendFoodSubmission,
  pullExercises,
  pullFoods,
  pullTaxonomies,
  submitExerciseToCatalog,
  submitFoodToCatalog,
  syncCatalog,
  withdrawExerciseSubmission,
  withdrawFoodSubmission,
} from "@/src/services/catalogSync";
import { catalogPhotoPath } from "@/src/services/photoSync";
import {
  CATALOG_EXERCISES_CURSOR,
  CATALOG_FOODS_CURSOR,
  CATALOG_PULLED_AT,
} from "@/src/services/syncMarkers";
import { useAccountStore } from "@/src/stores/accountStore";
import { useTaxonomyStore } from "@/src/stores/taxonomyStore";
import type { Equipment, MuscleGroup } from "@/src/types/gym";
import { logger } from "@/src/utils/logger";

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
  // Come fa `App.tsx` all'avvio: senza, `muscoliNoti()`/`attrezziNoti()`
  // partono vuoti e il filtro del pull butterebbe anche gli slug seminati
  // dalla migrazione 020.
  await useTaxonomyStore.getState().hydrate();
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

/**
 * Le tassonomie, vuote: un elenco vuoto non cancella niente, quindi darle
 * come risposta non cambia il resto di un test.
 */
const tassonomieVuote = { muscleGroups: [], equipment: [] };

/**
 * Una risposta per i due cataloghi, e la forma giusta per le tassonomie.
 *
 * `syncCatalog` pesca le tassonomie prima dei due cataloghi, e
 * `mockResolvedValue` da sola darebbe una pagina di catalogo anche a
 * `/catalog/taxonomies`: quella non porta `muscleGroups`, `pullTaxonomies`
 * incassa l'errore e scrive un warn: un warn previsto in coda all'output dei
 * test prima o poi qualcuno lo inseguirebbe come se fosse un difetto.
 */
const rispondi = (perCatalogo: unknown) =>
  mockApiRequest.mockImplementation(({ path }: { path: string }) =>
    Promise.resolve(
      path === "/catalog/taxonomies" ? tassonomieVuote : perCatalogo,
    ),
  );

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
   * F1 della review finale. Fin qui la voce si SCARTAVA, e in silenzio: il
   * cursore avanza comunque, quindi al giro dopo il server non ha piu' niente
   * da dare per quella riga e l'esercizio non arriva **mai piu'** su questo
   * telefono. Bastava un `/catalog/taxonomies` caduto, o un amministratore
   * che scrive uno slug che la tabella non ha - il server non lo impedisce.
   *
   * La voce si tiene. L'etichetta ricade sullo slug crudo (§ `taxonomyLabel`)
   * finche' il prossimo pull di tassonomia non la colma: uno slug a schermo
   * per un giro invece di un esercizio che non esiste.
   */
  it("tiene una voce il cui gruppo muscolare non e' ancora in tassonomia", async () => {
    // Il warn di sotto e' previsto: zittito, o resta in coda all'output dei
    // test e qualcuno lo inseguirebbe come se fosse un difetto.
    const warn = jest.spyOn(logger, "warn").mockImplementation(() => {});
    mockApiRequest.mockResolvedValue(pagina([voce({ muscleGroup: "trapezi" })]));

    expect(await pullExercises()).toBe(1);
    const [riga] = await searchExercises({ term: "panca" });
    expect(riga.muscle_group).toBe("trapezi");
    warn.mockRestore();
  });

  /**
   * Lo scarto era muto: nessun `logger`, nessuna riga in `app_logs`, niente
   * in Diagnostica da collegare a un esercizio mancante. Ora c'e', **una
   * volta per giro** e non una per voce: `app_logs` ne tiene trecento in
   * tutto, e duecento righe identiche svuoterebbero il registro proprio nel
   * giro in cui serve leggerlo.
   */
  it("annota gli slug sconosciuti una volta per giro, non una per voce", async () => {
    const warn = jest.spyOn(logger, "warn").mockImplementation(() => {});
    mockApiRequest.mockResolvedValue(
      pagina([
        voce({ uid: "ex-uno", name: "Scrollate", muscleGroup: "trapezi" }),
        voce({ uid: "ex-due", name: "Shrug", muscleGroup: "trapezi" }),
        voce({ uid: "ex-tre", name: "Ponte", muscleGroup: "glutei_medi" }),
      ]),
    );

    await pullExercises();

    const righe = warn.mock.calls.filter((c) =>
      String(c[0]).includes("non in tassonomia"),
    );
    expect(righe).toHaveLength(1);
    // Ordinati, e ognuno una volta sola: e' un insieme, non un elenco.
    expect(String(righe[0][0])).toContain("glutei_medi, trapezi");
    warn.mockRestore();
  });

  /**
   * QUESTO TEST DICEVA IL CONTRARIO, e la decisione e' cambiata di proposito.
   *
   * Diceva `tiene solo gli attrezzi e i muscoli che conosce`, e asseriva
   * `["bilanciere"]` e `["tricipiti"]` - gli sconosciuti spariti dall'elenco.
   * Era la regola dichiarata ("quel che non si conosce si butta"), la stessa
   * che F1 ha ribaltato sul gruppo muscolare principale: tenerla qui lasciava
   * il file con due filosofie a una riga di distanza, e la perdita era
   * definitiva allo stesso modo, perche' il cursore avanza. "Al prossimo pull
   * si rimedia" vale solo se la voce cambia **di nuovo** sul server, e nessuno
   * modifica un esercizio per riparare l'elenco attrezzi di un telefono.
   *
   * Ora si tengono tutti e si annotano, ed e' un'asserzione piu' forte di
   * prima: gli array esatti **piu'** la riga in Diagnostica che spiega
   * l'etichetta cruda.
   */
  it("tiene anche gli attrezzi e i muscoli che non conosce, e li annota", async () => {
    const warn = jest.spyOn(logger, "warn").mockImplementation(() => {});
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
    expect(JSON.parse(riga.equipment ?? "[]")).toEqual([
      "bilanciere",
      "astronave",
    ]);
    expect(JSON.parse(riga.secondary_muscles ?? "[]")).toEqual([
      "tricipiti",
      "branchie",
    ]);
    // Un elenco solo per gruppi e attrezzi: la conseguenza a schermo e' la
    // stessa, e distinguerli sarebbe due righe per dire una cosa.
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("astronave, branchie"),
    );
    warn.mockRestore();
  });

  /**
   * Quel che `parseSlugs` butta ancora, e sono le due cose che non sono slug:
   * la stringa vuota (`"".split(",")` da' `[""]`) e i doppioni, perche' un
   * elenco di attrezzi e' un insieme e due volte lo stesso non dice niente.
   */
  it("scarta il vuoto e i doppioni, che non sono slug", async () => {
    mockApiRequest.mockResolvedValue(
      pagina([
        voce({
          equipment: "bilanciere,,bilanciere, panca",
          secondaryMuscles: "",
        }),
      ]),
    );

    await pullExercises();

    const [riga] = await searchExercises({ term: "panca" });
    expect(JSON.parse(riga.equipment ?? "[]")).toEqual(["bilanciere", "panca"]);
    expect(JSON.parse(riga.secondary_muscles ?? "[]")).toEqual([]);
  });

  /**
   * Step 5: il metro e' la tassonomia locale, non piu' le costanti compilate
   * in questa versione dell'app. Uno slug che il pannello ha aggiunto -
   * assente da MUSCLE_GROUPS - deve sopravvivere al pull, non essere buttato
   * come "branchie" qui sopra.
   */
  it("tiene un gruppo muscolare che le costanti non conoscono ma la tassonomia si'", async () => {
    await taxonomyQueries.replaceTaxonomy("muscle_groups", [
      { slug: "trapezi", label_it: "Trapezi", label_en: "Traps", sort: 130, deleted_at: null },
    ]);
    // Nel giro vero e' `pullTaxonomies` a ridratare lo store, PRIMA del pull
    // degli esercizi (§ eseguiGiroCatalogo). Qui si chiama `pullExercises`
    // direttamente, quindi la stessa idratazione va rifatta a mano.
    await useTaxonomyStore.getState().hydrate();
    mockApiRequest.mockResolvedValue(pagina([voce({ muscleGroup: "trapezi" })]));

    expect(await pullExercises()).toBe(1);
    expect(await searchExercises({ term: "panca" })).toHaveLength(1);
  });

  /** Stesso principio, sull'attrezzatura. */
  it("tiene un attrezzo che le costanti non conoscono ma la tassonomia si'", async () => {
    await taxonomyQueries.replaceTaxonomy("equipment_types", [
      { slug: "anelli", label_it: "Anelli", label_en: "Rings", sort: 120, deleted_at: null },
    ]);
    await useTaxonomyStore.getState().hydrate();
    mockApiRequest.mockResolvedValue(pagina([voce({ equipment: "anelli" })]));

    await pullExercises();

    const [riga] = await searchExercises({ term: "panca" });
    expect(JSON.parse(riga.equipment ?? "[]")).toEqual(["anelli"]);
  });

  /**
   * "I cancellati contano come noti": un gruppo tolto dal pannello non deve
   * far scartare una voce di catalogo che lo nomina - le righe gia'
   * installate devono continuare a ricevere aggiornamenti, e la loro
   * etichetta c'e' ancora (§ taxonomyLabel).
   */
  it("tiene un gruppo muscolare cancellato dalla tassonomia", async () => {
    await taxonomyQueries.replaceTaxonomy("muscle_groups", [
      { slug: "femorali", label_it: "Femorali", label_en: "Hamstrings", sort: 90, deleted_at: "2026-09-08T09:00:00+00:00" },
    ]);
    await useTaxonomyStore.getState().hydrate();
    mockApiRequest.mockResolvedValue(pagina([voce({ muscleGroup: "femorali" })]));

    expect(await pullExercises()).toBe(1);
    expect(await searchExercises({ term: "panca" })).toHaveLength(1);
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
   * F7 della review finale. `readCursor` accetta `afterId` solo come numero
   * JSON e niente lato server lo garantisce: su un driver che restituisse
   * `id` come stringa (PDO MySQL lo fa di serie) la risposta porterebbe
   * `"afterId": "42"`, e scritto cosi' `readCursor` lo rifiuterebbe al giro
   * dopo - il pull ripartirebbe da zero **per sempre**, in silenzio. Le cifre
   * si convertono, com'e' gia' la regola del contatore della
   * sincronizzazione.
   */
  it("un `afterId` in cifre dentro una stringa si salva come numero", async () => {
    mockApiRequest.mockResolvedValue({
      data: [],
      cursor: { since: "2026-09-08T10:00:00+00:00", afterId: "42" },
      next: null,
    });

    await pullExercises();

    expect(
      JSON.parse((await getSetting(CATALOG_EXERCISES_CURSOR)) ?? "null"),
    ).toEqual({ since: "2026-09-08T10:00:00+00:00", afterId: 42 });
  });

  /**
   * Qualunque altra forma non si scrive, e si annota: un cursore inventato
   * salterebbe righe che il server non rimanderebbe piu'. Non scrivere niente
   * costa al massimo di rileggere la stessa pagina, che e' idempotente.
   */
  it("un `afterId` che non e' un numero non si salva affatto", async () => {
    const warn = jest.spyOn(logger, "warn").mockImplementation(() => {});
    mockApiRequest.mockResolvedValue({
      data: [],
      cursor: { since: "2026-09-08T10:00:00+00:00", afterId: null },
      next: null,
    });

    await pullExercises();

    expect(await getSetting(CATALOG_EXERCISES_CURSOR)).toBeNull();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("cursore inutilizzabile"),
    );
    warn.mockRestore();
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
  /**
   * Finding 2 (Critical). `applyExercise` legge e poi scrive attraverso un
   * `await`: senza guardia, un secondo giro puo' fare la sua lettura nel
   * buco fra la lettura e la scrittura del primo, trovare anche lui `null` e
   * inserire la stessa voce due volte - "una rinomina, un doppione per
   * telefono", riaperto senza bisogno di nessuna rinomina. Il secondo
   * chiamante si aggancia al giro gia' in volo: stesso oggetto di ritorno,
   * una sola coppia di richieste HTTP, una riga sola.
   */
  it("due giri in volo insieme si agganciano allo stesso giro, non ne fanno due", async () => {
    rispondi(pagina([voce()]));

    const [a, b] = await Promise.all([syncCatalog(true), syncCatalog(true)]);

    expect(a).toBe(b);
    // Tre e non due: le tassonomie, gli esercizi, gli alimenti. Il conto e'
    // di un giro solo - due giri sovrapposti ne farebbero sei.
    expect(mockApiRequest).toHaveBeenCalledTimes(3);
    expect(await searchExercises({ term: "panca" })).toHaveLength(1);
  });

  it("fa i due pull e somma quel che hanno toccato", async () => {
    mockApiRequest
      // Le tassonomie per prime: e' l'ordine di `syncCatalog`, e il filtro
      // degli slug misura contro quel che la tassonomia conosce.
      .mockResolvedValueOnce(tassonomieVuote)
      .mockResolvedValueOnce(pagina([voce()]))
      .mockResolvedValueOnce(pagina([alimento()]));

    expect(await syncCatalog()).toEqual({ toccate: 2, riuscito: true });
    expect(mockApiRequest).toHaveBeenCalledTimes(3);
  });

  /**
   * Il secondo pull deve partire comunque: gli alimenti non devono restare
   * indietro perche' il catalogo degli esercizi non ha risposto. Ma il giro
   * nel complesso NON e' riuscito, e non deve scrivere il segnaposto: un
   * pezzo caduto merita un altro tentativo al prossimo innesco, non un'ora di
   * silenzio (finding 1).
   */
  it("il secondo pull parte anche se il primo e' andato male, ma il giro resta fallito", async () => {
    mockApiRequest
      .mockResolvedValueOnce(tassonomieVuote)
      .mockRejectedValueOnce(new Error("rete assente"))
      .mockResolvedValueOnce(pagina([alimento()]));

    expect(await syncCatalog()).toEqual({ toccate: 1, riuscito: false });
    expect(await getSetting(CATALOG_PULLED_AT)).toBeNull();
  });

  /**
   * F1 della review finale, la meta' del giro. Le tassonomie sono la gamba
   * che le altre due misurano, e non entravano nel `riuscito`: un giro in cui
   * cadevano loro e riuscivano i due pull scriveva il segnaposto e chiudeva
   * la finestra per un'ora - le etichette restavano quelle di prima con la
   * rete tornata a funzionare, che e' esattamente il difetto per cui il
   * segnaposto si scrive solo sui giri arrivati davvero.
   *
   * E la voce col gruppo sconosciuto **c'e'**: prima veniva buttata, il
   * cursore avanzava e non tornava mai piu'.
   */
  it("le tassonomie cadute rendono il giro fallito, e la voce nuova resta", async () => {
    // Due warn previsti qui: le tassonomie cadute e lo slug sconosciuto.
    const warn = jest.spyOn(logger, "warn").mockImplementation(() => {});
    mockApiRequest.mockImplementation(({ path }: { path: string }) => {
      if (path === "/catalog/taxonomies") {
        return Promise.reject(new Error("rete assente"));
      }
      if (path === "/catalog/exercises") {
        return Promise.resolve(pagina([voce({ muscleGroup: "trapezi" })]));
      }
      return Promise.resolve(pagina([]));
    });

    expect(await syncCatalog()).toEqual({ toccate: 1, riuscito: false });
    expect(await getSetting(CATALOG_PULLED_AT)).toBeNull();
    expect(await searchExercises({ term: "panca" })).toHaveLength(1);
    warn.mockRestore();
  });

  /**
   * Il pull parte all'avvio e a ogni ritorno in primo piano: senza una
   * finestra, alternare due app avanti e indietro chiederebbe il catalogo a
   * ogni passaggio.
   */
  it("due chiamate ravvicinate fanno un giro solo", async () => {
    rispondi(pagina([]));

    await syncCatalog();
    const dopoIlPrimo = mockApiRequest.mock.calls.length;
    await syncCatalog();

    expect(mockApiRequest.mock.calls.length).toBe(dopoIlPrimo);
  });

  it("`force` scavalca la finestra: e' il bottone dell'utente", async () => {
    rispondi(pagina([]));

    await syncCatalog();
    const dopoIlPrimo = mockApiRequest.mock.calls.length;
    await syncCatalog(true);

    expect(mockApiRequest.mock.calls.length).toBeGreaterThan(dopoIlPrimo);
  });

  it("passata l'ora si rifa'", async () => {
    rispondi(pagina([]));
    await syncCatalog();

    // Un'ora e un minuto fa. Si scrive il segnaposto invece di spostare
    // l'orologio: e' un confronto fra due istanti, e falsificare il dato e'
    // piu' diretto che falsificare il tempo.
    await setSetting(
      CATALOG_PULLED_AT,
      new Date(Date.now() - 61 * 60 * 1000).toISOString(),
    );
    const dopoIlPrimo = mockApiRequest.mock.calls.length;

    await syncCatalog();

    expect(mockApiRequest.mock.calls.length).toBeGreaterThan(dopoIlPrimo);
  });

  it("senza account non scrive il segnaposto, o il primo pull vero aspetterebbe un'ora", async () => {
    useAccountStore.setState({ token: null, profile: null });

    expect(await syncCatalog()).toEqual({ toccate: 0, riuscito: false });
    expect(await getSetting(CATALOG_PULLED_AT)).toBeNull();
  });

  /** Finding 7: `force` scavalca la finestra, non l'account. */
  it("`force` non scavalca l'account: senza token il segnaposto resta vuoto", async () => {
    useAccountStore.setState({ token: null, profile: null });
    rispondi(pagina([]));

    expect(await syncCatalog(true)).toEqual({ toccate: 0, riuscito: false });
    expect(await getSetting(CATALOG_PULLED_AT)).toBeNull();
  });

  /**
   * Finding 8: il bottone deve chiudere la finestra come un giro automatico,
   * o ogni tocco lascerebbe la finestra aperta per il prossimo ritorno in
   * primo piano - la finestra smetterebbe di applicarsi a chi usa il bottone.
   */
  it("`force` scrive comunque il segnaposto", async () => {
    rispondi(pagina([]));

    await syncCatalog(true);
    const dopoIlPrimo = mockApiRequest.mock.calls.length;
    await syncCatalog();

    expect(mockApiRequest.mock.calls.length).toBe(dopoIlPrimo);
  });

  /**
   * Finding 9: un segnaposto illeggibile conta come "mai fatto", non come
   * "fatto per sempre". La differenza e' grave: con `false` al posto di
   * `true` il pull non aspetterebbe un'ora, resterebbe bloccato per sempre,
   * perche' nessun giro futuro puo' mai far scattare `Date.now() - NaN`.
   */
  it("un segnaposto illeggibile conta come 'mai fatto'", async () => {
    await setSetting(CATALOG_PULLED_AT, "non-una-data");
    rispondi(pagina([]));

    await syncCatalog();

    expect(mockApiRequest).toHaveBeenCalled();
  });

  /**
   * Finding 12, regola 2 della sincronizzazione: si confrontano istanti, non
   * cifre. Un segnaposto scritto con un fuso diverso da zero rappresenta lo
   * stesso istante di uno in UTC, ma un confronto ingenuo fra stringhe legge
   * solo le cifre dell'ora scritta e la giudicherebbe "piu' recente" solo
   * perche' sono numericamente piu' alte - esattamente il caso che
   * distingue "T13:00+02:00" (le 11:00 UTC) da un segnaposto in UTC.
   */
  it("un segnaposto in un altro fuso si confronta per istante, non per cifre", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-09-08T15:00:00.000Z"));
    try {
      // Le 15:00+02:00 sono le 13:00 UTC: due ore prima delle 15:00 UTC di
      // "adesso", oltre la finestra di un'ora.
      await setSetting(CATALOG_PULLED_AT, "2026-09-08T15:00:00+02:00");
      rispondi(pagina([]));

      await syncCatalog();

      expect(mockApiRequest).toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("proporre e correggere una propria voce", () => {
  // Tipizzata esplicitamente: senza, `muscleGroup`/`secondaryMuscles`/
  // `equipment` si allargano a `string`/`string[]` e non bastano piu' a
  // `createExercise`, che vuole `MuscleGroup`/`Equipment[]`.
  // Due elementi in `secondaryMuscles`/`equipment`, non uno: con un solo
  // elemento `join(",")`, `join(";")` e `join("")` producono la stessa
  // stringa, e il separatore smetterebbe di essere davvero verificato.
  const proposta: {
    name: string;
    muscleGroup: MuscleGroup;
    secondaryMuscles: MuscleGroup[];
    equipment: Equipment[];
  } = {
    name: "Spinte sopra la testa",
    muscleGroup: "spalle",
    secondaryMuscles: ["tricipiti", "petto"],
    equipment: ["manubri", "panca"],
  };

  it("propone e salva l'uid che il server risponde", async () => {
    const id = await createExercise({ ...proposta });
    mockApiRequest.mockResolvedValue({ data: { uid: "uuid-della-proposta" } });

    await submitExerciseToCatalog(id, proposta);

    expect(mockApiRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "post",
        path: "/catalog/exercises",
        body: {
          name: "Spinte sopra la testa",
          muscleGroup: "spalle",
          secondaryMuscles: "tricipiti,petto",
          equipment: "manubri,panca",
        },
      }),
    );
    expect((await getExercise(id))?.catalog_uid).toBe("uuid-della-proposta");
  });

  /**
   * Il server risponde `{ ok: true }` senza `data` quando il nome combacia
   * con una voce che qualcuno ha tolto dal catalogo: non ha creato niente, e
   * non c'e' nessun uid da salvare. Non e' un errore, e la prova non e' solo
   * che `catalog_uid` resta nullo - un `TypeError` incassato dal `catch`
   * darebbe lo stesso risultato - ma che non c'e' stato niente da incassare.
   */
  it("una risposta senza uid non scrive niente e non solleva", async () => {
    const id = await createExercise({ ...proposta });
    mockApiRequest.mockResolvedValue({ ok: true });
    const warnSpy = jest.spyOn(logger, "warn").mockImplementation(() => {});

    await submitExerciseToCatalog(id, proposta);

    expect((await getExercise(id))?.catalog_uid).toBeNull();
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  /**
   * Il difetto chiuso qui: prima si ritrovava la voce cercando il nome
   * PRECEDENTE fra le voci pubblicate, e una proposta in attesa non e' fra
   * quelle - quindi ogni correzione depositava una seconda proposta.
   */
  it("corregge la propria proposta per uid, senza cercarla per nome", async () => {
    const id = await createExercise({
      ...proposta,
      catalogUid: "uuid-della-proposta",
    });
    const riga = await getExercise(id);
    mockApiRequest.mockResolvedValue({ data: { uid: "uuid-della-proposta" } });

    await amendExerciseSubmission(riga!, { ...proposta, name: "Military press" });

    expect(mockApiRequest).toHaveBeenCalledTimes(1);
    expect(mockApiRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "patch",
        path: "/catalog/exercises/uuid-della-proposta",
      }),
    );
  });

  /** Senza uid non c'e' niente da correggere: si propone come nuova. */
  it("una riga senza uid diventa una proposta nuova", async () => {
    const id = await createExercise({ ...proposta });
    const riga = await getExercise(id);
    mockApiRequest.mockResolvedValue({ data: { uid: "uuid-nuovo" } });

    await amendExerciseSubmission(riga!, proposta);

    expect(mockApiRequest).toHaveBeenCalledWith(
      expect.objectContaining({ method: "post" }),
    );
    expect((await getExercise(id))?.catalog_uid).toBe("uuid-nuovo");
  });

  it("ritira la propria proposta per uid", async () => {
    const id = await createExercise({
      ...proposta,
      catalogUid: "uuid-della-proposta",
    });
    const riga = await getExercise(id);
    mockApiRequest.mockResolvedValue({ ok: true });

    await withdrawExerciseSubmission(riga!);

    expect(mockApiRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "delete",
        path: "/catalog/exercises/uuid-della-proposta",
      }),
    );
  });

  it("senza uid non chiede niente al server", async () => {
    const id = await createExercise({ ...proposta });
    const riga = await getExercise(id);

    await withdrawExerciseSubmission(riga!);

    expect(mockApiRequest).not.toHaveBeenCalled();
  });

  it("senza account non propone niente", async () => {
    useAccountStore.setState({ token: null, profile: null });
    const id = await createExercise({ ...proposta });

    await submitExerciseToCatalog(id, proposta);

    expect(mockApiRequest).not.toHaveBeenCalled();
  });

  /**
   * La voce e' gia' salvata sul telefono quando questa parte: se il catalogo
   * non risponde, l'utente non deve vedere niente di rotto.
   */
  it("un 403 su una voce gia' pubblicata non solleva", async () => {
    const id = await createExercise({
      ...proposta,
      catalogUid: "uuid-della-proposta",
    });
    const riga = await getExercise(id);
    mockApiRequest.mockRejectedValue(new Error("403"));

    await expect(
      amendExerciseSubmission(riga!, proposta),
    ).resolves.toBeUndefined();
  });

  it("gli alimenti seguono le stesse tre regole", async () => {
    const id = await createFood({
      name: "Riso",
      nutrients: { ...EMPTY_NUTRIENTS, kcal: 358 },
    });
    mockApiRequest.mockResolvedValue({ data: { uid: "uuid-riso" } });

    await submitFoodToCatalog(id, { name: "Riso", nutrients: { ...EMPTY_NUTRIENTS, kcal: 358 } });
    expect((await getFood(id))?.catalog_uid).toBe("uuid-riso");

    const riga = await getFood(id);
    mockApiRequest.mockClear();
    mockApiRequest.mockResolvedValue({ ok: true });
    await withdrawFoodSubmission(riga!);
    expect(mockApiRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "delete",
        path: "/catalog/foods/uuid-riso",
      }),
    );
  });

  /**
   * La terza regola per gli alimenti, che il test sopra non copre: correggere
   * per uid invece di cercare per nome, lo stesso difetto chiuso per gli
   * esercizi.
   */
  it("corregge la propria proposta di alimento per uid, senza cercarla per nome", async () => {
    const id = await createFood({
      name: "Riso",
      nutrients: { ...EMPTY_NUTRIENTS, kcal: 358 },
      catalogUid: "uuid-riso",
    });
    const riga = await getFood(id);
    mockApiRequest.mockResolvedValue({ data: { uid: "uuid-riso" } });

    await amendFoodSubmission(riga!, {
      name: "Riso integrale",
      nutrients: { ...EMPTY_NUTRIENTS, kcal: 358 },
    });

    expect(mockApiRequest).toHaveBeenCalledTimes(1);
    expect(mockApiRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "patch",
        path: "/catalog/foods/uuid-riso",
      }),
    );
  });

  /** Senza uid non c'e' niente da correggere: si propone come alimento nuovo. */
  it("un alimento senza uid diventa una proposta nuova", async () => {
    const id = await createFood({
      name: "Riso",
      nutrients: { ...EMPTY_NUTRIENTS, kcal: 358 },
    });
    const riga = await getFood(id);
    mockApiRequest.mockResolvedValue({ data: { uid: "uuid-nuovo-riso" } });

    await amendFoodSubmission(riga!, {
      name: "Riso",
      nutrients: { ...EMPTY_NUTRIENTS, kcal: 358 },
    });

    expect(mockApiRequest).toHaveBeenCalledWith(
      expect.objectContaining({ method: "post" }),
    );
    expect((await getFood(id))?.catalog_uid).toBe("uuid-nuovo-riso");
  });

  it("senza uid non chiede niente al server per un alimento", async () => {
    const id = await createFood({
      name: "Riso",
      nutrients: { ...EMPTY_NUTRIENTS, kcal: 358 },
    });
    const riga = await getFood(id);

    await withdrawFoodSubmission(riga!);

    expect(mockApiRequest).not.toHaveBeenCalled();
  });

  it("senza account non propone niente per un alimento", async () => {
    useAccountStore.setState({ token: null, profile: null });
    const id = await createFood({
      name: "Riso",
      nutrients: { ...EMPTY_NUTRIENTS, kcal: 358 },
    });

    await submitFoodToCatalog(id, {
      name: "Riso",
      nutrients: { ...EMPTY_NUTRIENTS, kcal: 358 },
    });

    expect(mockApiRequest).not.toHaveBeenCalled();
  });
});

describe("il cancello di proprieta': una riga di catalogo non e' una propria proposta", () => {
  /**
   * Il difetto chiuso qui: `catalog_uid` da solo non dice "e' mia" - lo
   * scrive anche il pull su ogni riga che tocca, seed compresi. Senza questo
   * cancello, correggere o cancellare un esercizio di catalogo (`is_custom =
   * 0`) manda comunque un PATCH/DELETE, che il server rifiuta con 403 - e
   * ogni 403 finisce in `app_logs`.
   */
  it("una riga di catalogo (is_custom = 0) non manda niente ad amend", async () => {
    const id = await createExercise({
      name: "Panca piana",
      muscleGroup: "petto",
      secondaryMuscles: [],
      equipment: ["bilanciere"],
      catalogUid: "ex-panca-piana-bilanciere",
      isCustom: false,
    });
    const riga = await getExercise(id);

    await amendExerciseSubmission(riga!, {
      name: "Panca piana",
      muscleGroup: "petto",
      secondaryMuscles: [],
      equipment: ["bilanciere"],
    });

    expect(mockApiRequest).not.toHaveBeenCalled();
  });

  it("una riga di catalogo (is_custom = 0) non manda niente a withdraw", async () => {
    const id = await createExercise({
      name: "Panca piana",
      muscleGroup: "petto",
      secondaryMuscles: [],
      equipment: ["bilanciere"],
      catalogUid: "ex-panca-piana-bilanciere",
      isCustom: false,
    });
    const riga = await getExercise(id);

    await withdrawExerciseSubmission(riga!);

    expect(mockApiRequest).not.toHaveBeenCalled();
  });

  it("un alimento di catalogo (source = 'seed') non manda niente ad amend", async () => {
    const id = await createFood({
      name: "Riso",
      nutrients: { ...EMPTY_NUTRIENTS, kcal: 358 },
      source: "seed",
      catalogUid: "food-riso",
    });
    const riga = await getFood(id);

    await amendFoodSubmission(riga!, {
      name: "Riso",
      nutrients: { ...EMPTY_NUTRIENTS, kcal: 358 },
    });

    expect(mockApiRequest).not.toHaveBeenCalled();
  });

  it("un alimento di catalogo (source = 'seed') non manda niente a withdraw", async () => {
    const id = await createFood({
      name: "Riso",
      nutrients: { ...EMPTY_NUTRIENTS, kcal: 358 },
      source: "seed",
      catalogUid: "food-riso",
    });
    const riga = await getFood(id);

    await withdrawFoodSubmission(riga!);

    expect(mockApiRequest).not.toHaveBeenCalled();
  });
});

describe("pullTaxonomies", () => {
  // Le etichette dei ventitre' slug del seme sono italiane e inglesi; qui si
  // guarda `label_it`, quindi il locale va scelto invece di essere ereditato
  // dal default dei test ("en").
  beforeEach(() => {
    i18n.locale = "it";
  });
  afterEach(() => {
    i18n.locale = "en";
  });

  it("scrive quel che il server manda e ridrata lo store", async () => {
    mockApiRequest.mockResolvedValue({
      muscleGroups: [
        { slug: "femorali", labelIt: "Ischiocrurali", labelEn: "Hamstrings", sort: 90, deletedAt: null },
        { slug: "trapezi", labelIt: "Trapezi", labelEn: "Traps", sort: 130, deletedAt: null },
        // Cancellato: come `cavi` sotto, ma sul campo dei gruppi muscolari.
        // `liveEquipment` aveva gia' un caso cosi', `liveMuscleGroups` no.
        { slug: "avambracci", labelIt: "Avambracci", labelEn: "Forearms", sort: 60, deletedAt: "2026-09-08T09:00:00+00:00" },
      ],
      equipment: [
        { slug: "cavi", labelIt: "Cavi", labelEn: "Cables", sort: 50, deletedAt: "2026-09-08T09:00:00+00:00" },
      ],
    });

    await pullTaxonomies();

    expect(mockApiRequest).toHaveBeenCalledWith(
      expect.objectContaining({ method: "get", path: "/catalog/taxonomies" }),
    );

    const stato = useTaxonomyStore.getState();
    expect(stato.muscleLabel("femorali")).toBe("Ischiocrurali");
    expect(stato.muscleLabel("trapezi")).toBe("Trapezi");
    // Cancellato: non si offre in una scelta, ma l'etichetta ce l'ha ancora.
    expect(stato.liveMuscleGroups.map((r) => r.slug)).not.toContain(
      "avambracci",
    );
    expect(stato.muscleLabel("avambracci")).toBe("Avambracci");
    expect(stato.liveEquipment.map((r) => r.slug)).not.toContain("cavi");
    expect(stato.equipmentLabel("cavi")).toBe("Cavi");
    // I campi "tutti", cancellati compresi: senza consumatore oggi, ma il
    // task 12 li legge per il filtro del pull (`knownSlugs`).
    expect(stato.muscleGroups.map((r) => r.slug)).toContain("avambracci");
    expect(stato.equipment.map((r) => r.slug)).toContain("cavi");
  });

  it("un errore di rete non solleva e lascia in piedi le etichette di prima", async () => {
    await useTaxonomyStore.getState().hydrate();
    mockApiRequest.mockRejectedValue(new Error("rete assente"));

    // `false` e non `undefined`: il giro deve poter DIRE di non essere
    // arrivato al server, o `eseguiGiroCatalogo` chiude la finestra per
    // un'ora su etichette che non ha aggiornato (F1).
    await expect(pullTaxonomies()).resolves.toBe(false);
    expect(useTaxonomyStore.getState().muscleLabel("petto")).toBe("Petto");
  });

  it("senza account non chiede niente", async () => {
    useAccountStore.setState({ token: null, profile: null });

    await pullTaxonomies();

    expect(mockApiRequest).not.toHaveBeenCalled();
  });

  /**
   * I due `replaceTaxonomy` non condividono una transazione: se il secondo
   * solleva, il primo e' gia' su disco. Senza il `finally` lo store
   * resterebbe con le etichette vecchie anche per i gruppi muscolari appena
   * scritti - qui verificato idratando comunque dopo l'errore.
   */
  it("una scrittura parziale idrata comunque lo store con quel che e' gia' su disco", async () => {
    mockApiRequest.mockResolvedValue({
      muscleGroups: [
        { slug: "petto", labelIt: "Torace", labelEn: "Chest", sort: 10, deletedAt: null },
      ],
      equipment: [],
    });

    const originale = taxonomyQueries.replaceTaxonomy;
    jest
      .spyOn(taxonomyQueries, "replaceTaxonomy")
      .mockImplementation(async (kind, rows) => {
        if (kind === "equipment_types") {
          throw new Error("scrittura attrezzi fallita");
        }
        return originale(kind, rows);
      });

    // Una scrittura a meta' non e' un giro arrivato: `false`, come sopra.
    await expect(pullTaxonomies()).resolves.toBe(false);

    // I gruppi muscolari sono scritti davvero (l'implementazione originale
    // e' girata) e lo store li riflette, anche se il giro e' fallito a meta'.
    expect(useTaxonomyStore.getState().muscleLabel("petto")).toBe("Torace");
  });
});
