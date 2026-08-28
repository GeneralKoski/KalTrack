import { getDb } from "@/src/db/index";
import { newId, nowIso } from "@/src/db/ids";
import type { StepLogRow, StepSource, WeightLogRow } from "@/src/types/nutrition";

/**
 * Peso e passi sono UNA misura al giorno: l'indice unico sulla data lo impone e
 * la scrittura è un upsert, così reinserire un giorno lo sostituisce invece di
 * accumulare una seconda riga.
 *
 * Qui la cancellazione è fisica e non logica: dietro un valore giornaliero
 * unico non c'è storia da conservare, e tenere una riga cancellata bloccherebbe
 * l'indice unico al reinserimento dello stesso giorno.
 */

export async function getSteps(date: string): Promise<StepLogRow | null> {
  const db = await getDb();
  return db.getFirstAsync<StepLogRow>(
    "SELECT * FROM step_logs WHERE date = ?",
    [date],
  );
}

export async function setSteps(
  date: string,
  steps: number,
  source: StepSource = "manual",
): Promise<void> {
  if (steps < 0) throw new Error("I passi non possono essere negativi");

  const db = await getDb();
  const now = nowIso();
  await db.runAsync(
    `INSERT INTO step_logs (id, date, steps, source, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(date) DO UPDATE SET
       steps = excluded.steps,
       source = excluded.source,
       updated_at = excluded.updated_at`,
    [newId(), date, Math.round(steps), source, now, now],
  );
}

export async function listSteps(
  fromDate: string,
  toDate: string,
): Promise<StepLogRow[]> {
  const db = await getDb();
  return db.getAllAsync<StepLogRow>(
    "SELECT * FROM step_logs WHERE date BETWEEN ? AND ? ORDER BY date ASC",
    [fromDate, toDate],
  );
}

export async function deleteSteps(date: string): Promise<void> {
  const db = await getDb();
  await db.runAsync("DELETE FROM step_logs WHERE date = ?", [date]);
}

export async function getWeight(date: string): Promise<WeightLogRow | null> {
  const db = await getDb();
  return db.getFirstAsync<WeightLogRow>(
    "SELECT * FROM weight_logs WHERE date = ?",
    [date],
  );
}

export async function setWeight(
  date: string,
  weightKg: number,
  bodyFatPct: number | null = null,
  note: string | null = null,
): Promise<void> {
  if (weightKg <= 0) throw new Error("Il peso deve essere positivo");

  const db = await getDb();
  const now = nowIso();
  await db.runAsync(
    `INSERT INTO weight_logs (id, date, weight_kg, body_fat_pct, note, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(date) DO UPDATE SET
       weight_kg = excluded.weight_kg,
       body_fat_pct = excluded.body_fat_pct,
       note = excluded.note,
       updated_at = excluded.updated_at`,
    [newId(), date, weightKg, bodyFatPct, note, now, now],
  );
}

export async function listWeights(
  fromDate: string,
  toDate: string,
): Promise<WeightLogRow[]> {
  const db = await getDb();
  return db.getAllAsync<WeightLogRow>(
    "SELECT * FROM weight_logs WHERE date BETWEEN ? AND ? ORDER BY date ASC",
    [fromDate, toDate],
  );
}

export async function latestWeight(): Promise<WeightLogRow | null> {
  const db = await getDb();
  return db.getFirstAsync<WeightLogRow>(
    "SELECT * FROM weight_logs ORDER BY date DESC LIMIT 1",
  );
}

export async function deleteWeight(date: string): Promise<void> {
  const db = await getDb();
  await db.runAsync("DELETE FROM weight_logs WHERE date = ?", [date]);
}
