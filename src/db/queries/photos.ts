import { getDb } from "@/src/db/index";

/**
 * Le quattro colonne che contengono un percorso di foto.
 *
 * Sono qui e non sparse fra i moduli perche' la domanda "quali foto servono
 * ancora" e' una domanda su tutte e quattro insieme: una stessa immagine puo'
 * essere nominata da voci diverse, e una foto libera del diario e' **condivisa
 * fra le N voci** nate dalla stessa stima.
 */
const PHOTO_COLUMNS: { table: string; column: string }[] = [
  { table: "foods", column: "image_uri" },
  { table: "recipes", column: "photo_uri" },
  { table: "meal_entries", column: "photo_uri" },
  { table: "progress_photos", column: "uri" },
];

/** Il nome, cioe' l'ultima parte del percorso. */
const nameOf = (uri: string): string => uri.slice(uri.lastIndexOf("/") + 1);

async function namesWhere(deleted: boolean): Promise<Set<string>> {
  const db = await getDb();
  const names = new Set<string>();

  for (const { table, column } of PHOTO_COLUMNS) {
    const rows = await db.getAllAsync<{ uri: string | null }>(
      `SELECT ${column} AS uri FROM ${table}
        WHERE ${column} IS NOT NULL AND ${column} <> ''
          AND deleted_at IS ${deleted ? "NOT NULL" : "NULL"}`,
    );
    for (const row of rows) {
      if (row.uri) names.add(nameOf(row.uri));
    }
  }

  return names;
}

/**
 * I nomi delle foto che appartenevano a qualcosa di cancellato e che **nessuna
 * riga viva nomina piu'**.
 *
 * Il criterio non e' "quel che il server ha e il telefono no": una foto
 * scattata su un altro dispositivo sta sul server e qui non c'e' ancora, e
 * cancellarla distruggerebbe l'unica copia. Chiedere invece "a cosa serviva
 * questa" si risponde solo con quel che questo telefono sa davvero.
 *
 * La sottrazione delle righe vive non e' una cautela in piu', e' il caso
 * normale: una foto libera del diario e' condivisa fra le N voci di quella
 * stima, e togliere "il pane" non deve portare via l'immagine alle altre due.
 */
export async function orphanPhotoNames(): Promise<string[]> {
  const [cancellate, vive] = await Promise.all([
    namesWhere(true),
    namesWhere(false),
  ]);

  return [...cancellate].filter((name) => !vive.has(name));
}
