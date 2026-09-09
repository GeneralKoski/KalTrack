import type { Migration } from "@/src/db/migrations/types";

/**
 * La posizione di una scheda in elenco, perche' le schede si riordinano
 * trascinandole - come i promemoria (migrazione 013).
 *
 * IL SEME E' L'ORDINE ALFABETICO, NON QUELLO DI CREAZIONE. `listRoutines`
 * ordina per nome da sempre: seminare su `created_at` riscriverebbe l'elenco
 * dell'utente proprio nell'aggiornamento che introduce il trascinamento, cioe'
 * rimetterebbe dall'altro lato il difetto che il task 2 di questa fase ha
 * chiuso togliendo `is_active DESC` (una scheda che salta di posto da sola).
 * Seminato per nome, l'aggiornamento e' invisibile A CHI HA GIA' DELLE SCHEDE:
 * il suo elenco resta quello di ieri e solo un trascinamento lo cambia. Su
 * un'installazione nuova non c'e' niente da seminare e l'ordine lo scrive
 * `createRoutine`, cioe' l'elenco segue la creazione - ed e' giusto cosi': in
 * un elenco che si trascina una scheda nuova si accoda, non si riordina
 * l'elenco da sola.
 *
 * E' deterministico su due dispositivi A MENO DI DUE SCHEDE OMONIME. L'ordine
 * fra nomi diversi e' lo stesso ovunque, ma lo spareggio fra due righe con lo
 * STESSO nome legge `rowid`, e quello la sincronizzazione non lo allinea:
 * applica le righe nell'ordine del cursore, non di creazione. Due schede
 * omonime possono quindi seminare scambiate fra i due telefoni - non si perde
 * niente, restano entrambe vicine in elenco, e un trascinamento sistema
 * l'ordine. Per questo il seme non tocca comunque `updated_at`: non e' una
 * modifica dell'utente, e' lo stesso ordine scritto in colonna.
 *
 * Il conteggio comprende anche le schede cancellate, che quindi occupano un
 * numero: un buco nella numerazione delle vive non si vede, e la posizione di
 * una scheda ripristinata resta quella di prima invece di finire in mezzo a
 * due altre.
 *
 * QUEL CHE IL SEME NON PROMETTE E' L'UNICITA'. Qui le posizioni nascono tutte
 * diverse, ma `reorderRoutines` rinumera da zero le sole righe che l'elenco
 * gli passa, cioe' le vive: al primo trascinamento una cancellata puo'
 * ritrovarsi sulla stessa posizione di una viva. Non e' un difetto - una
 * cancellata non compare in elenco - e nessuna lettura si appoggia
 * all'unicita': l'ordine fra pari lo decide il ripiego `, name ASC` di
 * `listRoutines`.
 */
export const migration021: Migration = {
  version: 21,
  name: "routine_position",
  up: `
ALTER TABLE routines ADD COLUMN position INTEGER NOT NULL DEFAULT 0;

UPDATE routines SET position = (
  SELECT COUNT(*) FROM routines other
   WHERE other.name < routines.name
      OR (other.name = routines.name AND other.rowid < routines.rowid)
);
`,
};
