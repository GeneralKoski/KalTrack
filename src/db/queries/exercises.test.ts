import { createTestDb } from "@/src/db/__testing__/betterSqliteAdapter";
import { __setDbForTesting } from "@/src/db/index";
import { runMigrations } from "@/src/db/migrations";
import {
  applyCatalogExercise,
  createExercise,
  detachExerciseFromCatalog,
  findExerciseByCatalogUid,
  getExercise,
  listAvailableEquipment,
  listUsableEquipment,
  searchExercises,
  setExerciseBanned,
  setExerciseCatalogUid,
  setExerciseDislike,
  setEquipmentAvailability,
  suggestAlternatives,
  toggleExerciseBan,
} from "@/src/db/queries/exercises";
import { replaceTaxonomy } from "@/src/db/queries/taxonomies";
import type { LocalDatabase } from "@/src/db/sqliteAdapter";

let db: LocalDatabase;

beforeEach(async () => {
  db = createTestDb();
  await runMigrations(db);
  __setDbForTesting(db);
});

afterEach(() => __setDbForTesting(null));

const bench = {
  name: "Panca piana con bilanciere",
  muscleGroup: "petto" as const,
  secondaryMuscles: ["tricipiti" as const, "spalle" as const],
  equipment: ["bilanciere" as const, "panca" as const],
};

describe("createExercise", () => {
  it("salva e rilegge, con nome normalizzato", async () => {
    const id = await createExercise(bench);
    const row = await getExercise(id);
    expect(row?.name).toBe("Panca piana con bilanciere");
    expect(row?.name_norm).toBe("panca piana con bilanciere");
    expect(row?.muscle_group).toBe("petto");
    expect(row?.is_custom).toBe(1);
  });

  it("serializza attrezzatura e muscoli secondari", async () => {
    const id = await createExercise(bench);
    const row = await getExercise(id);
    expect(JSON.parse(row!.equipment!)).toEqual(["bilanciere", "panca"]);
    expect(JSON.parse(row!.secondary_muscles!)).toEqual(["tricipiti", "spalle"]);
  });
});

describe("searchExercises", () => {
  beforeEach(async () => {
    await createExercise(bench);
    await createExercise({
      name: "Croci ai cavi",
      muscleGroup: "petto",
      secondaryMuscles: [],
      equipment: ["cavi"],
    });
    await createExercise({
      name: "Stacco rumeno",
      muscleGroup: "femorali",
      secondaryMuscles: ["glutei"],
      equipment: ["bilanciere"],
    });
  });

  it("cerca per sottostringa ignorando accenti e maiuscole", async () => {
    expect((await searchExercises({ term: "PANCA" })).map((e) => e.name)).toEqual([
      "Panca piana con bilanciere",
    ]);
  });

  it("filtra per gruppo muscolare", async () => {
    const rows = await searchExercises({ muscleGroup: "petto" });
    expect(rows).toHaveLength(2);
  });

  it("esclude gli esercizi vietati", async () => {
    const rows = await searchExercises({ term: "stacco" });
    await toggleExerciseBan(rows[0].id);
    expect(await searchExercises({ term: "stacco" })).toHaveLength(0);
  });

  it("includendo i vietati li ritrova", async () => {
    const rows = await searchExercises({ term: "stacco" });
    await toggleExerciseBan(rows[0].id);
    expect(
      await searchExercises({ term: "stacco", includeBanned: true }),
    ).toHaveLength(1);
  });
});

describe("attrezzatura", () => {
  it("registra cosa è disponibile", async () => {
    await setEquipmentAvailability("bilanciere", true);
    await setEquipmentAvailability("macchina", false);

    const available = await listAvailableEquipment();
    expect(available).toContain("bilanciere");
    expect(available).not.toContain("macchina");
  });

  it("cambiare disponibilità aggiorna invece di duplicare", async () => {
    await setEquipmentAvailability("cavi", true);
    await setEquipmentAvailability("cavi", false);
    expect(await listAvailableEquipment()).not.toContain("cavi");
  });
});

describe("listAvailableEquipment con la tassonomia", () => {
  /**
   * L'elenco e' per ECCEZIONE e non per dichiarazione: un attrezzo mai
   * toccato conta come disponibile. Su un telefono appena installato il
   * risultato e' quindi l'attrezzatura completa.
   */
  it("torna tutti gli attrezzi vivi, meno quelli tolti a mano", async () => {
    await setEquipmentAvailability("cavi", false);

    const disponibili = await listAvailableEquipment();

    expect(disponibili).not.toContain("cavi");
    expect(disponibili).toContain("bilanciere");
    expect(disponibili).toHaveLength(10);
  });

  /**
   * Un attrezzo cancellato dal pannello non si offre piu': non e' una scelta
   * che si possa fare, e proporlo genererebbe schede con un attrezzo che il
   * catalogo non conosce piu'.
   */
  it("non offre un attrezzo cancellato dalla tassonomia", async () => {
    await replaceTaxonomy("equipment_types", [
      { slug: "trx", label_it: "TRX", label_en: "TRX", sort: 100, deleted_at: "2026-09-08T09:00:00+00:00" },
    ]);

    expect(await listAvailableEquipment()).not.toContain("trx");
  });

  /** Uno slug nuovo arriva senza un rilascio dell'app. */
  it("offre uno slug che il pannello ha aggiunto", async () => {
    await replaceTaxonomy("equipment_types", [
      { slug: "anelli", label_it: "Anelli", label_en: "Rings", sort: 120, deleted_at: null },
    ]);

    expect(await listAvailableEquipment()).toContain("anelli");
  });

  /**
   * L'ordine segue la colonna `sort`, non lo slug: e' quel che permette al
   * pannello di riordinare l'elenco. La migrazione 020 assegna i `sort`
   * nello stesso ordine di `EQUIPMENT`, e su un telefono appena installato
   * l'elenco deve uscire in quell'ordine, non alfabetico.
   */
  it("segue l'ordine di sort, non quello alfabetico", async () => {
    expect(await listAvailableEquipment()).toEqual([
      "corpo_libero",
      "bilanciere",
      "manubri",
      "kettlebell",
      "cavi",
      "macchina",
      "panca",
      "sbarra",
      "elastici",
      "trx",
      "cardio",
    ]);
  });
});

describe("suggestAlternatives", () => {
  beforeEach(async () => {
    await createExercise(bench);
    await createExercise({
      name: "Chest press a macchina",
      muscleGroup: "petto",
      secondaryMuscles: ["tricipiti"],
      equipment: ["macchina"],
    });
    await createExercise({
      name: "Piegamenti",
      muscleGroup: "petto",
      secondaryMuscles: ["tricipiti"],
      equipment: ["corpo_libero"],
    });
    await createExercise({
      name: "Curl con manubri",
      muscleGroup: "bicipiti",
      secondaryMuscles: [],
      equipment: ["manubri"],
    });
  });

  const idOf = async (name: string) =>
    (await searchExercises({ term: name }))[0].id;

  it("propone solo esercizi dello stesso gruppo muscolare", async () => {
    const alternatives = await suggestAlternatives(await idOf("panca"));
    expect(alternatives.map((a) => a.name)).not.toContain("Curl con manubri");
  });

  it("non propone l'esercizio stesso", async () => {
    const id = await idOf("panca");
    const alternatives = await suggestAlternatives(id);
    expect(alternatives.map((a) => a.id)).not.toContain(id);
  });

  it("con attrezzatura dichiarata scarta ciò che non si può fare", async () => {
    // Ogni attrezzo conta come disponibile finche' non lo si toglie a mano:
    // togliere la macchina e' come dichiarare "non ce l'ho".
    await setEquipmentAvailability("macchina", false);
    const alternatives = await suggestAlternatives(await idOf("panca"), {
      onlyAvailableEquipment: true,
    });
    expect(alternatives.map((a) => a.name)).toEqual(["Piegamenti"]);
  });

  it("non propone mai un esercizio vietato", async () => {
    const pushups = await idOf("piegamenti");
    await toggleExerciseBan(pushups);
    const alternatives = await suggestAlternatives(await idOf("panca"));
    expect(alternatives.map((a) => a.id)).not.toContain(pushups);
  });

  it("mette in fondo quelli sgraditi invece di escluderli", async () => {
    // Sgradito non è vietato: resta proponibile come ultima risorsa.
    const pushups = await idOf("piegamenti");
    await setExerciseDislike(pushups, 2);

    const alternatives = await suggestAlternatives(await idOf("panca"));
    expect(alternatives[alternatives.length - 1].id).toBe(pushups);
    expect(alternatives.map((a) => a.id)).toContain(pushups);
  });
});

describe("attrezzatura e corpo libero", () => {
  /**
   * Il difetto che questo test blocca: "corpo_libero" e' un valore vero della
   * lista, non l'assenza di valori, e veniva trattato come un attrezzo da
   * possedere. Chi dichiarava "ho i manubri" si vedeva sparire dalle
   * alternative ogni esercizio senza attrezzi.
   */
  it("propone gli esercizi a corpo libero anche se non li hai dichiarati", async () => {
    const dips = await createExercise({
      name: "Dip alle parallele",
      muscleGroup: "petto",
      secondaryMuscles: [],
      equipment: ["corpo_libero"],
    });
    const bench = await createExercise({
      name: "Panca manubri",
      muscleGroup: "petto",
      secondaryMuscles: [],
      equipment: ["manubri", "panca"],
    });
    const machine = await createExercise({
      name: "Chest press",
      muscleGroup: "petto",
      secondaryMuscles: [],
      equipment: ["macchina"],
    });
    // Solo la macchina va tolta esplicitamente: manubri e panca sono gia'
    // disponibili di default.
    await setEquipmentAvailability("macchina", false);

    const ids = (
      await suggestAlternatives(bench, { onlyAvailableEquipment: true })
    ).map((row) => row.id);
    expect(ids).toContain(dips);
    expect(ids).not.toContain(machine);
  });

  /**
   * L'attrezzatura e' disponibile per eccezione: senza dichiarazioni non si
   * esclude niente, perche' niente e' stato tolto.
   */
  it("senza dichiarazioni esplicite, tutto conta come disponibile", async () => {
    const bench = await createExercise({
      name: "Panca bilanciere",
      muscleGroup: "petto",
      secondaryMuscles: [],
      equipment: ["bilanciere", "panca"],
    });
    const machine = await createExercise({
      name: "Pectoral machine",
      muscleGroup: "petto",
      secondaryMuscles: [],
      equipment: ["macchina"],
    });

    const ids = (
      await suggestAlternatives(bench, { onlyAvailableEquipment: true })
    ).map((row) => row.id);
    expect(ids).toContain(machine);
  });

  /**
   * Il difetto: `suggestAlternatives` non offre una scelta, filtra esercizi
   * che esistono gia'. Un amministratore che cancella "panca" dal catalogo
   * non deve far sparire dalle alternative gli esercizi con la panca -
   * l'utente non l'ha mai tolta e la panca fisica resta li'.
   */
  it("un attrezzo cancellato dalla tassonomia non toglie gli esercizi che lo usano", async () => {
    const withBench = await createExercise({
      name: "Croci alla panca",
      muscleGroup: "petto",
      secondaryMuscles: [],
      equipment: ["panca"],
    });
    const other = await createExercise({
      name: "Panca piana con bilanciere",
      muscleGroup: "petto",
      secondaryMuscles: [],
      equipment: ["bilanciere", "panca"],
    });

    await replaceTaxonomy("equipment_types", [
      { slug: "panca", label_it: "Panca", label_en: "Bench", sort: 70, deleted_at: "2026-09-08T09:00:00+00:00" },
    ]);

    const ids = (
      await suggestAlternatives(other, { onlyAvailableEquipment: true })
    ).map((row) => row.id);
    expect(ids).toContain(withBench);
  });
});

describe("listUsableEquipment", () => {
  /** La lettura di chi disegna quel che c'e' gia': i cancellati restano. */
  it("comprende un attrezzo cancellato dalla tassonomia", async () => {
    await replaceTaxonomy("equipment_types", [
      { slug: "trx", label_it: "TRX", label_en: "TRX", sort: 100, deleted_at: "2026-09-08T09:00:00+00:00" },
    ]);

    expect(await listUsableEquipment()).toContain("trx");
  });

  /** L'esclusione dell'utente resta identica alle due letture. */
  it("esclude comunque un attrezzo tolto a mano", async () => {
    await setEquipmentAvailability("cavi", false);

    expect(await listUsableEquipment()).not.toContain("cavi");
  });
});

describe("l'aggancio al catalogo", () => {
  it("ritrova una riga dal suo uid", async () => {
    const id = await createExercise({
      name: "Panca piana",
      muscleGroup: "petto",
      secondaryMuscles: [],
      equipment: ["bilanciere"],
      catalogUid: "ex-panca-piana-bilanciere",
      isCustom: false,
    });

    const trovato = await findExerciseByCatalogUid("ex-panca-piana-bilanciere");
    expect(trovato?.id).toBe(id);
  });

  /**
   * E' il primo pull dopo l'aggiornamento: la riga c'e', l'uid no, e si
   * aggancia per nome una volta sola.
   */
  it("appiccica l'uid a una riga che non ce l'ha", async () => {
    const id = await createExercise({
      name: "Squat",
      muscleGroup: "quadricipiti",
      secondaryMuscles: [],
      equipment: ["bilanciere"],
      isCustom: false,
    });
    expect((await getExercise(id))?.catalog_uid).toBeNull();

    await setExerciseCatalogUid(id, "ex-squat-bilanciere");

    expect((await getExercise(id))?.catalog_uid).toBe("ex-squat-bilanciere");
  });

  /**
   * La regola 2 di questa fase, ed e' quella che il catalogo non deve poter
   * violare: quel che si pensa di un esercizio non e' la sua descrizione.
   */
  it("riscrive la descrizione e non i giudizi personali", async () => {
    const id = await createExercise({
      name: "Panca piana",
      muscleGroup: "petto",
      secondaryMuscles: [],
      equipment: ["bilanciere"],
      notes: "spalla destra, attenzione",
      isCustom: false,
    });
    await setExerciseDislike(id, 2);
    await setExerciseBanned(id, true);

    await applyCatalogExercise(id, "ex-panca-piana-bilanciere", {
      name: "Panca piana con bilanciere",
      muscleGroup: "petto",
      secondaryMuscles: ["tricipiti"],
      equipment: ["bilanciere", "panca"],
      instructions: "Scapole addotte, bilanciere a mezzo petto.",
      photoUri: null,
    });

    const riga = await getExercise(id);
    expect(riga?.name).toBe("Panca piana con bilanciere");
    expect(riga?.name_norm).toBe("panca piana con bilanciere");
    expect(riga?.instructions).toBe("Scapole addotte, bilanciere a mezzo petto.");
    expect(riga?.catalog_uid).toBe("ex-panca-piana-bilanciere");
    // Quel che il catalogo non deve aver toccato.
    expect(riga?.notes).toBe("spalla destra, attenzione");
    expect(riga?.dislike_level).toBe(2);
    expect(riga?.is_banned).toBe(1);
  });

  /**
   * La regola 3: tolta dal catalogo, la riga resta e diventa dell'utente.
   * Cancellarla porterebbe via il nome a ogni allenamento passato che la
   * nominava, che e' esattamente quel che `deleteRoutine` evita non
   * cancellando i giorni.
   */
  it("staccata dal catalogo resta, e diventa dell'utente", async () => {
    const id = await createExercise({
      name: "Panca piana",
      muscleGroup: "petto",
      secondaryMuscles: [],
      equipment: ["bilanciere"],
      catalogUid: "ex-panca-piana-bilanciere",
      isCustom: false,
    });

    await detachExerciseFromCatalog(id);

    const riga = await getExercise(id);
    expect(riga).not.toBeNull();
    expect(riga?.is_custom).toBe(1);
    // L'uid RESTA: senza, una voce ripristinata dal pannello non si
    // riconoscerebbe piu' e il pull ne creerebbe un doppione.
    expect(riga?.catalog_uid).toBe("ex-panca-piana-bilanciere");
  });
});
