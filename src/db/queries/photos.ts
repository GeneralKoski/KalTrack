import { getDb } from "@/src/db/index";

/**
 * Le cinque colonne che contengono un percorso di foto.
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
  { table: "exercises", column: "photo_uri" },
];

/** Il nome, cioe' l'ultima parte del percorso. */
const nameOf = (uri: string): string => uri.slice(uri.lastIndexOf("/") + 1);

/**
 * Si torna il PERCORSO e non il nome, ed e' il rimedio a un difetto.
 *
 * Dalla Fase 3 due di queste colonne (`foods.image_uri`,
 * `exercises.photo_uri`) contengono anche percorsi di `CATALOG_PHOTOS_DIR`,
 * che e' un'altra cartella e un'altra domanda: una foto di catalogo non e'
 * orfana perche' un esercizio e' stato cancellato - e' ancora la foto di
 * quella voce per tutti gli altri - e non si cancella dal server, dove e'
 * comune a tutti gli iscritti. Il nome nudo non dice a quale delle due
 * cartelle appartiene, e `collectOrphanPhotos` finiva per cancellare
 * `PHOTOS_DIR/<nome di catalogo>` (un no-op) e contarlo fra le rimosse.
 *
 * Questo modulo resta ignaro di dove vivano i file: dice cosa le righe
 * nominano, e chi conosce le cartelle (`photoSync`) classifica.
 */
async function urisWhere(deleted: boolean): Promise<string[]> {
  const db = await getDb();
  const uris: string[] = [];

  for (const { table, column } of PHOTO_COLUMNS) {
    const rows = await db.getAllAsync<{ uri: string | null }>(
      `SELECT ${column} AS uri FROM ${table}
        WHERE ${column} IS NOT NULL AND ${column} <> ''
          AND deleted_at IS ${deleted ? "NOT NULL" : "NULL"}`,
    );
    for (const row of rows) {
      if (row.uri) uris.push(row.uri);
    }
  }

  return uris;
}

/**
 * I percorsi delle foto che appartenevano a qualcosa di cancellato e che
 * **nessuna riga viva nomina piu'**.
 *
 * Il criterio non e' "quel che il server ha e il telefono no": una foto
 * scattata su un altro dispositivo sta sul server e qui non c'e' ancora, e
 * cancellarla distruggerebbe l'unica copia. Chiedere invece "a cosa serviva
 * questa" si risponde solo con quel che questo telefono sa davvero.
 *
 * La sottrazione delle righe vive non e' una cautela in piu', e' il caso
 * normale: una foto libera del diario e' condivisa fra le N voci di quella
 * stima, e togliere "il pane" non deve portare via l'immagine alle altre due.
 *
 * Un nome esce una volta sola: e' l'identita' della foto (vedi CLAUDE.md
 * § Le foto), e due righe cancellate che nominano lo stesso file sono un file
 * da cancellare una volta.
 */
export async function orphanPhotoUris(): Promise<string[]> {
  const [cancellate, vive] = await Promise.all([
    urisWhere(true),
    urisWhere(false),
  ]);

  const nomiVivi = new Set(vive.map(nameOf));
  const visti = new Set<string>();

  return cancellate.filter((uri) => {
    const name = nameOf(uri);
    if (nomiVivi.has(name) || visti.has(name)) return false;
    visti.add(name);
    return true;
  });
}

/**
 * Ogni percorso che una riga nomina ancora, cancellata o viva.
 *
 * E' la domanda delle foto di CATALOGO, e non e' la stessa di
 * `orphanPhotoUris`: quella chiede "a cosa serviva", questa "serve ancora a
 * qualcosa". Il file di catalogo diventa inutile quando il pannello lo
 * sostituisce o lo toglie - il pull scrive il `photo_uri` nuovo (o `null`) su
 * una riga **viva**, e da quel momento il vecchio non e' nominato da
 * nessuno, ne' fra le righe cancellate ne' fra le vive: cadeva fuori da
 * entrambi gli insiemi di `orphanPhotoUris` e non era raccoglibile nemmeno in
 * principio.
 *
 * Le righe cancellate ci sono dentro apposta: un esercizio che l'utente ha
 * cancellato non porta via la foto della voce di catalogo, che resta quella di
 * tutti gli altri.
 */
export async function referencedPhotoUris(): Promise<string[]> {
  const [cancellate, vive] = await Promise.all([
    urisWhere(true),
    urisWhere(false),
  ]);

  return [...cancellate, ...vive];
}
