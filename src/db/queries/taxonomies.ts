import { getDb } from "@/src/db/index";

/**
 * I gruppi muscolari e l'attrezzatura, copia locale di quel che il server
 * pubblica per tutti.
 *
 * UNA SOLA LETTURA, e la distinzione sta un livello piu' su. Sono ventitre'
 * righe: chi le legge le rilegge tutte, cancellati compresi, e a dividerle e'
 * `taxonomyStore.hydrate()`, che dallo stesso elenco ricava
 * `muscleGroups`/`equipment` (tutti, per DISEGNARE QUEL CHE C'E' GIA' - le
 * etichette) e `liveMuscleGroups`/`liveEquipment` (solo i vivi, per chi OFFRE
 * UNA SCELTA - i selettori, `create_exercise`).
 *
 * C'e' stata anche una `listTaxonomy` che filtrava i cancellati in SQL, ed e'
 * stata ritirata il 9 settembre 2026: nessun consumatore la chiamava piu' -
 * i lettori sono passati allo store - e teneva la regola scritta in un posto
 * che nessuno esegue, dove chi la andava a cercare la trovava morta e la
 * reimplementava una terza volta. Rimetterla vorrebbe dire quattro query dove
 * ne bastano due e un filtro, per rifare al database una domanda a cui lo
 * store ha gia' la risposta in mano.
 *
 * Chiunque aggiunga una lettura deve comunque scegliere, e la domanda e'
 * sempre la stessa: sto offrendo una scelta o sto disegnando quel che c'e'
 * gia'? Solo che si risponde scegliendo il campo dello store, non la query.
 */

/** Il nome della tabella, che e' anche il tipo di tassonomia. */
export type TaxonomyKind = "muscle_groups" | "equipment_types";

export interface TaxonomyRow {
  slug: string;
  label_it: string;
  label_en: string;
  sort: number;
  deleted_at: string | null;
}

/*
 * Il nome della tabella si interpola nella query, quindi non puo' venire da
 * fuori: `TaxonomyKind` e' un'unione di due letterali e il compilatore non
 * lascia passare altro. Un identificatore SQL non si puo' legare con un
 * parametro, e questa e' la ragione per cui il tipo e' cosi' stretto.
 */

/** Tutti, cancellati compresi: serve a disegnare l'etichetta di quel che c'e'. */
export async function listAllTaxonomy(
  kind: TaxonomyKind,
): Promise<TaxonomyRow[]> {
  const db = await getDb();
  return db.getAllAsync<TaxonomyRow>(
    `SELECT * FROM ${kind} ORDER BY sort, slug`,
  );
}

/**
 * Scrive quel che il server ha mandato.
 *
 * E' un upsert per slug e NON una riscrittura in blocco: cancellare e
 * reinserire lascerebbe, fra le due operazioni, un istante in cui nessuno
 * slug esiste - e una schermata che leggesse li' in mezzo disegnerebbe un
 * elenco vuoto. Ed e' anche il motivo per cui un elenco vuoto non cancella
 * niente: una risposta vuota e' una risposta che non dice niente, non un
 * ordine di svuotare la tabella.
 *
 * `deleted_at` si scrive sempre, anche a null: e' cosi' che una riga
 * ripristinata dal pannello torna in elenco.
 */
export async function replaceTaxonomy(
  kind: TaxonomyKind,
  rows: TaxonomyRow[],
): Promise<void> {
  if (rows.length === 0) return;

  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (const row of rows) {
      await db.runAsync(
        `INSERT INTO ${kind} (slug, label_it, label_en, sort, deleted_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(slug) DO UPDATE SET
           label_it = excluded.label_it,
           label_en = excluded.label_en,
           sort = excluded.sort,
           deleted_at = excluded.deleted_at`,
        [row.slug, row.label_it, row.label_en, row.sort, row.deleted_at],
      );
    }
  });
}
