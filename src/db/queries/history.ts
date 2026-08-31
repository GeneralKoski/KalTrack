import { getDb } from "@/src/db";

/**
 * Il primo giorno di cui esiste una traccia, fra quelli che la condivisione
 * pubblica: pasti, passi, peso, allenamenti.
 *
 * Serve da quando la finestra di condivisione non si sceglie piu' e si pubblica
 * tutto lo storico: "tutto" ha bisogno di un inizio, e l'unico che non inventa
 * niente e' il primo dato scritto. Senza, l'alternativa sarebbe una data fissa
 * da cui contare - e ogni giorno in piu' fra quella e il primo dato sarebbe una
 * giornata vuota interrogata e spedita per niente.
 *
 * `null` quando non c'e' ancora nessun dato: chi non ha scritto niente non ha
 * uno storico da pubblicare.
 */
export async function earliestRecordedDate(): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ date: string | null }>(
    `SELECT MIN(date) AS date FROM (
       SELECT MIN(date) AS date FROM meals WHERE deleted_at IS NULL
       UNION ALL
       SELECT MIN(date) FROM step_logs WHERE deleted_at IS NULL
       UNION ALL
       SELECT MIN(date) FROM weight_logs WHERE deleted_at IS NULL
       UNION ALL
       SELECT MIN(date) FROM workout_sessions WHERE deleted_at IS NULL
     )`,
  );
  return row?.date ?? null;
}
