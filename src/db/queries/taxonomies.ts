import { getDb } from "@/src/db/index";

/**
 * I gruppi muscolari e l'attrezzatura, copia locale di quel che il server
 * pubblica per tutti.
 *
 * DUE LETTURE E NON UNA, ed e' la stessa distinzione dei tipi di pasto:
 * `listTaxonomy` esclude i cancellati ed e' la lettura di chi OFFRE UNA
 * SCELTA - il selettore del gruppo muscolare, i chip dell'attrezzatura;
 * `listAllTaxonomy` li comprende ed e' la lettura di chi DISEGNA QUEL CHE C'E'
 * GIA' - l'etichetta di un esercizio che nomina quello slug in colonna.
 *
 * Chiunque aggiunga una lettura deve scegliere, e la domanda e' sempre la
 * stessa: sto offrendo una scelta o sto disegnando quel che c'e' gia'?
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

/** Gli slug che si possono offrire in una scelta: i cancellati non ci sono. */
export async function listTaxonomy(
  kind: TaxonomyKind,
): Promise<TaxonomyRow[]> {
  const db = await getDb();
  return db.getAllAsync<TaxonomyRow>(
    `SELECT * FROM ${kind} WHERE deleted_at IS NULL ORDER BY sort, slug`,
  );
}

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
