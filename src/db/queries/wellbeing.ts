import { getDb } from "@/src/db/index";
import { newId, nowIso } from "@/src/db/ids";

export interface WaterLogRow {
  id: string;
  date: string;
  ml: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface MeasurementRow {
  id: string;
  date: string;
  site: string;
  value_cm: number;
  note: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface ProgressPhotoRow {
  id: string;
  date: string;
  uri: string;
  pose: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface FastingRow {
  id: string;
  started_at: string;
  ended_at: string | null;
  target_hours: number | null;
  note: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

// ─── Acqua ───────────────────────────────────────────────────────────────────
//
// A differenza di peso e passi l'acqua NON è una misura unica giornaliera: si
// beve a più riprese, quindi ogni bicchiere è una riga e il giorno è la somma.

export async function addWater(date: string, ml: number): Promise<void> {
  if (ml <= 0) throw new Error("La quantità d'acqua deve essere positiva");
  const db = await getDb();
  const now = nowIso();
  await db.runAsync(
    "INSERT INTO water_logs (id, date, ml, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    [newId(), date, Math.round(ml), now, now],
  );
}

export async function getWaterTotal(date: string): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ total: number | null }>(
    "SELECT SUM(ml) AS total FROM water_logs WHERE date = ? AND deleted_at IS NULL",
    [date],
  );
  return row?.total ?? 0;
}

/** Annulla l'ultimo bicchiere: un tocco di troppo capita, e aprire una lista per correggerlo sarebbe sproporzionato. */
export async function removeLastWater(date: string): Promise<void> {
  const db = await getDb();
  // rowid come spareggio: due bicchieri aggiunti nello stesso istante hanno lo
  // stesso created_at, e senza questo si cancellerebbe quello sbagliato.
  const last = await db.getFirstAsync<{ id: string }>(
    `SELECT id FROM water_logs WHERE date = ? AND deleted_at IS NULL
     ORDER BY created_at DESC, rowid DESC LIMIT 1`,
    [date],
  );
  if (!last) return;
  // Cancellazione LOGICA, non fisica: una riga tolta dal database non ha piu'
  // modo di dire all'altro dispositivo che e' stata tolta, e alla prima
  // sincronizzazione tornerebbe indietro dal server. Il bicchiere annullato
  // si ripresenterebbe da solo.
  await db.runAsync(
    "UPDATE water_logs SET deleted_at = ?, updated_at = ? WHERE id = ?",
    [nowIso(), nowIso(), last.id],
  );
}

// ─── Misure corporee ─────────────────────────────────────────────────────────

export async function setMeasurement(
  date: string,
  site: string,
  valueCm: number,
  note: string | null = null,
): Promise<void> {
  if (valueCm <= 0) throw new Error("La misura deve essere positiva");
  const db = await getDb();
  const now = nowIso();
  await db.runAsync(
    `INSERT INTO body_measurements (id, date, site, value_cm, note, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(date, site) DO UPDATE SET
       value_cm = excluded.value_cm,
       note = excluded.note,
       deleted_at = NULL,
       updated_at = excluded.updated_at`,
    [newId(), date, site, valueCm, note, now, now],
  );
}

export async function listMeasurements(site: string): Promise<MeasurementRow[]> {
  const db = await getDb();
  return db.getAllAsync<MeasurementRow>(
    "SELECT * FROM body_measurements WHERE site = ? AND deleted_at IS NULL ORDER BY date ASC",
    [site],
  );
}

export async function listMeasurementSites(): Promise<string[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ site: string }>(
    "SELECT DISTINCT site FROM body_measurements WHERE deleted_at IS NULL ORDER BY site ASC",
  );
  return rows.map((r) => r.site);
}

// ─── Foto dei progressi ──────────────────────────────────────────────────────

export async function addProgressPhoto(
  date: string,
  uri: string,
  pose: string | null = null,
): Promise<string> {
  const db = await getDb();
  const id = newId();
  const now = nowIso();
  await db.runAsync(
    `INSERT INTO progress_photos (id, date, uri, pose, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, date, uri, pose, now, now],
  );
  return id;
}

export async function listProgressPhotos(): Promise<ProgressPhotoRow[]> {
  const db = await getDb();
  return db.getAllAsync<ProgressPhotoRow>(
    "SELECT * FROM progress_photos WHERE deleted_at IS NULL ORDER BY date DESC, created_at DESC",
  );
}

export async function deleteProgressPhoto(id: string): Promise<void> {
  const db = await getDb();
  const now = nowIso();
  await db.runAsync(
    "UPDATE progress_photos SET deleted_at = ?, updated_at = ? WHERE id = ?",
    [now, now, id],
  );
}

// ─── Digiuno ─────────────────────────────────────────────────────────────────

export async function openFasting(): Promise<FastingRow | null> {
  const db = await getDb();
  return db.getFirstAsync<FastingRow>(
    `SELECT * FROM fasting_windows
     WHERE ended_at IS NULL AND deleted_at IS NULL
     ORDER BY started_at DESC LIMIT 1`,
  );
}

/**
 * Apre una finestra di digiuno, chiudendo l'eventuale precedente ancora aperta.
 * Due digiuni aperti insieme non hanno significato e romperebbero ogni conteggio.
 */
export async function startFasting(
  startedAt: string,
  targetHours: number | null = null,
): Promise<string> {
  const db = await getDb();
  const id = newId();
  const now = nowIso();

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      "UPDATE fasting_windows SET ended_at = ?, updated_at = ? WHERE ended_at IS NULL AND deleted_at IS NULL",
      [startedAt, now],
    );
    await db.runAsync(
      `INSERT INTO fasting_windows (id, started_at, target_hours, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
      [id, startedAt, targetHours, now, now],
    );
  });
  return id;
}

export async function endFasting(endedAt: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    "UPDATE fasting_windows SET ended_at = ?, updated_at = ? WHERE ended_at IS NULL AND deleted_at IS NULL",
    [endedAt, nowIso()],
  );
}

export async function listFastingHistory(limit = 30): Promise<FastingRow[]> {
  const db = await getDb();
  return db.getAllAsync<FastingRow>(
    `SELECT * FROM fasting_windows
     WHERE ended_at IS NOT NULL AND deleted_at IS NULL
     ORDER BY started_at DESC LIMIT ?`,
    [limit],
  );
}
