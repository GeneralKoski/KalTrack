import { createTestDb } from "@/src/db/__testing__/betterSqliteAdapter";
import { MIGRATIONS, runMigrations } from "@/src/db/migrations";
import type { LocalDatabase } from "@/src/db/sqliteAdapter";

const userVersion = async (db: LocalDatabase): Promise<number> => {
  const row = await db.getFirstAsync<{ user_version: number }>(
    "PRAGMA user_version",
  );
  return row?.user_version ?? 0;
};

const tableNames = async (db: LocalDatabase): Promise<string[]> => {
  const rows = await db.getAllAsync<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
  );
  return rows.map((r) => r.name);
};

describe("runMigrations", () => {
  it("porta un DB vuoto all'ultima versione", async () => {
    const db = createTestDb();
    const version = await runMigrations(db);

    expect(version).toBe(MIGRATIONS[MIGRATIONS.length - 1].version);
    expect(await userVersion(db)).toBe(version);
  });

  it("crea tutte le tabelle della Fase 1", async () => {
    const db = createTestDb();
    await runMigrations(db);

    const tables = await tableNames(db);
    for (const expected of [
      "foods",
      "recipes",
      "recipe_items",
      "meal_types",
      "meals",
      "meal_entries",
      "profile",
      "targets",
      "weight_logs",
      "step_logs",
      "settings",
    ]) {
      expect(tables).toContain(expected);
    }
  });

  it("è idempotente: rieseguirla non cambia nulla", async () => {
    const db = createTestDb();
    const first = await runMigrations(db);
    const second = await runMigrations(db);

    expect(second).toBe(first);
  });

  it("parte dalla versione dichiarata, non da zero", async () => {
    const db = createTestDb();
    await db.execAsync(`PRAGMA user_version = ${MIGRATIONS[0].version}`);

    // La 001 risulta già applicata ma le tabelle non esistono: la 002, che
    // scrive in meal_types, deve fallire. Se non fallisse, il runner starebbe
    // ignorando user_version e riapplicando tutto da capo.
    await expect(runMigrations(db)).rejects.toThrow();
  });

  it("una migrazione fallita non avanza user_version", async () => {
    const db = createTestDb();
    await db.execAsync(`PRAGMA user_version = ${MIGRATIONS[0].version}`);

    await expect(runMigrations(db)).rejects.toThrow();
    expect(await userVersion(db)).toBe(MIGRATIONS[0].version);
  });

  it("i tipi di pasto di default sono presenti una sola volta e in ordine", async () => {
    const db = createTestDb();
    await runMigrations(db);

    const rows = await db.getAllAsync<{ name: string }>(
      "SELECT name FROM meal_types WHERE deleted_at IS NULL ORDER BY sort",
    );
    expect(rows.map((r) => r.name)).toEqual([
      "colazione",
      "brunch",
      "pranzo",
      "snack",
      "cena",
    ]);
  });

  it("le versioni delle migrazioni sono uniche e crescenti", () => {
    const versions = MIGRATIONS.map((m) => m.version);
    expect(new Set(versions).size).toBe(versions.length);
    expect([...versions].sort((a, b) => a - b)).toEqual(versions);
  });
});
