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
    "SELECT * FROM step_logs WHERE date = ? AND deleted_at IS NULL",
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
       -- Il giorno torna vivo: senza, dopo una cancellazione l'upsert
       -- aggiornerebbe i numeri su una riga che nessuna lettura vede piu'.
       deleted_at = NULL,
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
    `SELECT * FROM step_logs WHERE date BETWEEN ? AND ?
       AND deleted_at IS NULL ORDER BY date ASC`,
    [fromDate, toDate],
  );
}

/**
 * Cancellazione LOGICA, non fisica.
 *
 * Una riga tolta dal database non ha piu' modo di dire all'altro dispositivo
 * che e' stata tolta: alla prima sincronizzazione il server la rimanderebbe
 * indietro e i passi cancellati resusciterebbero.
 */
export async function deleteSteps(date: string): Promise<void> {
  const db = await getDb();
  const now = nowIso();
  await db.runAsync(
    "UPDATE step_logs SET deleted_at = ?, updated_at = ? WHERE date = ? AND deleted_at IS NULL",
    [now, now, date],
  );
}

export async function getWeight(date: string): Promise<WeightLogRow | null> {
  const db = await getDb();
  return db.getFirstAsync<WeightLogRow>(
    "SELECT * FROM weight_logs WHERE date = ? AND deleted_at IS NULL",
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
       -- Come per i passi: reinserire un peso riporta in vita il giorno.
       deleted_at = NULL,
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
    `SELECT * FROM weight_logs WHERE date BETWEEN ? AND ?
       AND deleted_at IS NULL ORDER BY date ASC`,
    [fromDate, toDate],
  );
}

export async function latestWeight(): Promise<WeightLogRow | null> {
  const db = await getDb();
  return db.getFirstAsync<WeightLogRow>(
    "SELECT * FROM weight_logs WHERE deleted_at IS NULL ORDER BY date DESC LIMIT 1",
  );
}

/** Come deleteSteps: logica, o il peso cancellato torna dal server. */
export async function deleteWeight(date: string): Promise<void> {
  const db = await getDb();
  const now = nowIso();
  await db.runAsync(
    "UPDATE weight_logs SET deleted_at = ?, updated_at = ? WHERE date = ? AND deleted_at IS NULL",
    [now, now, date],
  );
}

/**
 * I passi di un intervallo, sommati.
 *
 * Null e non zero se in quei giorni non c'e' nessuna registrazione: "non ho
 * registrato" e "ho fatto zero passi" restano due fatti diversi anche su una
 * settimana.
 */
export async function stepsInRange(
  from: string,
  to: string,
): Promise<number | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ total: number | null; giorni: number }>(
    `SELECT SUM(steps) AS total, COUNT(*) AS giorni
       FROM step_logs
      WHERE date >= ? AND date <= ? AND deleted_at IS NULL`,
    [from, to],
  );
  return row && row.giorni > 0 ? (row.total ?? null) : null;
}
