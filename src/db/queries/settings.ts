import { getDb } from "@/src/db/index";
import { newId, nowIso } from "@/src/db/ids";
import type {
  ActivityLevel,
  Goal,
  Sex,
} from "@/src/domain/targets";
import type { ProfileRow, TargetRow } from "@/src/types/nutrition";

/** Il profilo è una riga sola: id fisso, così salvare è sempre un upsert. */
const PROFILE_ID = "profile";

export async function getProfile(): Promise<ProfileRow | null> {
  const db = await getDb();
  return db.getFirstAsync<ProfileRow>(
    "SELECT * FROM profile WHERE id = ? AND deleted_at IS NULL",
    [PROFILE_ID],
  );
}

export async function saveProfile(input: {
  sex: Sex;
  birthdate: string;
  /** Null quando non e' stata inserita: la colonna e' nullable apposta, e uno
   *  zero sarebbe una misura inventata invece di un dato mancante. */
  heightCm: number | null;
  activityLevel: ActivityLevel;
  goal: Goal;
}): Promise<void> {
  const db = await getDb();
  const now = nowIso();
  await db.runAsync(
    `INSERT INTO profile (id, sex, birthdate, height_cm, activity_level, goal,
       created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       sex = excluded.sex,
       birthdate = excluded.birthdate,
       height_cm = excluded.height_cm,
       activity_level = excluded.activity_level,
       goal = excluded.goal,
       deleted_at = NULL,
       updated_at = excluded.updated_at`,
    [
      PROFILE_ID,
      input.sex,
      input.birthdate,
      input.heightCm,
      input.activityLevel,
      input.goal,
      now,
      now,
    ],
  );
}

/**
 * L'obiettivo in vigore a una data: il più recente non successivo ad essa.
 *
 * Gli obiettivi sono storicizzati e mai sovrascritti in loco, così alzare le
 * calorie oggi lascia i giorni di marzo misurati sull'obiettivo di marzo e i
 * grafici restano onesti.
 */
export async function getTargetsFor(date: string): Promise<TargetRow | null> {
  const db = await getDb();
  return db.getFirstAsync<TargetRow>(
    `SELECT * FROM targets
     WHERE deleted_at IS NULL AND valid_from <= ?
     ORDER BY valid_from DESC LIMIT 1`,
    [date],
  );
}

export async function saveTargets(input: {
  validFrom: string;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  steps: number;
}): Promise<void> {
  const db = await getDb();
  const now = nowIso();

  await db.withTransactionAsync(async () => {
    // Due obiettivi con la stessa decorrenza sarebbero ambigui: il nuovo
    // sostituisce il precedente invece di affiancarlo.
    await db.runAsync(
      "UPDATE targets SET deleted_at = ?, updated_at = ? WHERE valid_from = ? AND deleted_at IS NULL",
      [now, now, input.validFrom],
    );
    await db.runAsync(
      `INSERT INTO targets (id, valid_from, kcal, protein_g, carbs_g, fat_g,
         steps, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newId(),
        input.validFrom,
        input.kcal,
        input.proteinG,
        input.carbsG,
        input.fatG,
        input.steps,
        now,
        now,
      ],
    );
  });
}

export async function getSetting(key: string): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM settings WHERE key = ?",
    [key],
  );
  return row?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [key, value, nowIso()],
  );
}
