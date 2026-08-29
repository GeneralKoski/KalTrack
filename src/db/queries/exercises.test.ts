import { createTestDb } from "@/src/db/__testing__/betterSqliteAdapter";
import { __setDbForTesting } from "@/src/db/index";
import { runMigrations } from "@/src/db/migrations";
import {
  createExercise,
  getExercise,
  listAvailableEquipment,
  searchExercises,
  setExerciseDislike,
  setEquipmentAvailability,
  suggestAlternatives,
  toggleExerciseBan,
} from "@/src/db/queries/exercises";
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
    await setEquipmentAvailability("corpo_libero", true);
    // Nessuna macchina disponibile: la chest press non deve comparire.
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
    await setEquipmentAvailability("manubri", true);
    await setEquipmentAvailability("panca", true);

    const ids = (
      await suggestAlternatives(bench, { onlyAvailableEquipment: true })
    ).map((row) => row.id);
    expect(ids).toContain(dips);
    expect(ids).not.toContain(machine);
  });

  /**
   * Un elenco vuoto vuol dire "non ho ancora detto cosa ho", non "non ho
   * niente": filtrandoci sopra le alternative si riducevano al corpo libero.
   */
  it("non filtra finche' l'attrezzatura non e' stata dichiarata", async () => {
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
});
