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
 * Seminato per nome, l'aggiornamento e' invisibile: l'elenco resta quello di
 * ieri e solo un trascinamento lo cambia.
 *
 * E' anche deterministico su due dispositivi: i nomi sono gli stessi da
 * entrambe le parti, quindi le due migrazioni calcolano le stesse posizioni
 * senza doversele sincronizzare. Per questo il seme non tocca `updated_at`:
 * non e' una modifica dell'utente, e' lo stesso ordine scritto in colonna.
 *
 * Il conteggio comprende anche le schede cancellate, cosi' le posizioni sono
 * uniche su tutta la tabella e non solo fra le vive: un buco in elenco non si
 * vede, due schede sulla stessa posizione si.
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
