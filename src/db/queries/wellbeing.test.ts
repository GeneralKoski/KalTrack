import { createTestDb } from "@/src/db/__testing__/betterSqliteAdapter";
import { __setDbForTesting } from "@/src/db/index";
import { runMigrations } from "@/src/db/migrations";
import {
  addProgressPhoto,
  addWater,
  getWaterTotal,
  listMeasurements,
  listProgressPhotos,
  removeLastWater,
  setMeasurement,
} from "@/src/db/queries/wellbeing";
import type { LocalDatabase } from "@/src/db/sqliteAdapter";

let db: LocalDatabase;
const DATE = "2026-08-29";

beforeEach(async () => {
  db = createTestDb();
  await runMigrations(db);
  __setDbForTesting(db);
});

afterEach(() => __setDbForTesting(null));

describe("acqua", () => {
  it("si somma nella giornata invece di sostituirsi", async () => {
    // Diversamente da peso e passi: l'acqua si beve a più riprese.
    await addWater(DATE, 250);
    await addWater(DATE, 500);
    expect(await getWaterTotal(DATE)).toBe(750);
  });

  it("un giorno senza registrazioni è zero", async () => {
    expect(await getWaterTotal(DATE)).toBe(0);
  });

  it("non mescola i giorni", async () => {
    await addWater(DATE, 500);
    expect(await getWaterTotal("2026-08-28")).toBe(0);
  });

  it("si può annullare l'ultimo bicchiere", async () => {
    // Un tocco di troppo capita: serve tornare indietro senza aprire una lista.
    await addWater(DATE, 250);
    await addWater(DATE, 500);
    await removeLastWater(DATE);
    expect(await getWaterTotal(DATE)).toBe(250);
  });

  it("annullare su un giorno vuoto non fallisce", async () => {
    await removeLastWater(DATE);
    expect(await getWaterTotal(DATE)).toBe(0);
  });

  it("rifiuta quantità non positive", async () => {
    await expect(addWater(DATE, 0)).rejects.toThrow();
    await expect(addWater(DATE, -100)).rejects.toThrow();
  });
});

describe("misure corporee", () => {
  it("salva e rilegge una misura", async () => {
    await setMeasurement(DATE, "vita", 84.5);
    const rows = await listMeasurements("vita");
    expect(rows[0].value_cm).toBe(84.5);
  });

  it("una misura per sito per giorno: riscrivere sostituisce", async () => {
    await setMeasurement(DATE, "vita", 84.5);
    await setMeasurement(DATE, "vita", 83.8);
    const rows = await listMeasurements("vita");
    expect(rows).toHaveLength(1);
    expect(rows[0].value_cm).toBe(83.8);
  });

  it("siti diversi nello stesso giorno convivono", async () => {
    await setMeasurement(DATE, "vita", 84);
    await setMeasurement(DATE, "braccio", 36);
    expect(await listMeasurements("vita")).toHaveLength(1);
    expect(await listMeasurements("braccio")).toHaveLength(1);
  });

  it("le misure tornano in ordine cronologico", async () => {
    await setMeasurement("2026-08-20", "vita", 86);
    await setMeasurement("2026-08-29", "vita", 84);
    const rows = await listMeasurements("vita");
    expect(rows.map((r) => r.value_cm)).toEqual([86, 84]);
  });
});

describe("foto dei progressi", () => {
  it("più foto nello stesso giorno convivono", async () => {
    // Fronte, lato e retro sono tre scatti dello stesso giorno.
    await addProgressPhoto(DATE, "file://fronte.jpg", "fronte");
    await addProgressPhoto(DATE, "file://lato.jpg", "lato");
    expect(await listProgressPhotos()).toHaveLength(2);
  });

  it("tornano dalla più recente", async () => {
    await addProgressPhoto("2026-08-20", "file://vecchia.jpg");
    await addProgressPhoto("2026-08-29", "file://nuova.jpg");
    expect((await listProgressPhotos())[0].uri).toBe("file://nuova.jpg");
  });
});
