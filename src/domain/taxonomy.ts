import type { TaxonomyRow } from "@/src/db/queries/taxonomies";

/**
 * L'etichetta di uno slug, nella lingua chiesta.
 *
 * Tre gradini, in quest'ordine e per ragioni diverse:
 *
 * 1. LA RIGA DELLA TASSONOMIA. E' il caso normale, e l'unico che funziona per
 *    un gruppo aggiunto dal pannello: arriva con la propria etichetta gia'
 *    scritta da chi l'ha creato, ed e' il motivo per cui la tabella ha due
 *    colonne di etichetta e non una chiave i18n.
 * 2. LA CHIAVE i18n, per i ventitre' slug del seme. Serve solo se la tabella
 *    non e' ancora stata letta - all'avvio, prima dell'idratazione - e non e'
 *    ridondanza: senza, quella frazione di secondo mostrerebbe degli slug.
 * 3. LO SLUG. Uno slug crudo e' brutto; `[missing "en.gym.muscle.trapezi"]`
 *    e' un difetto a schermo.
 *
 * `language` si passa e non si legge da `i18n` qui dentro: `src/domain/` non
 * conosce React ne' i18n, e questo e' il modulo che si puo' provare in jest
 * senza montare niente.
 */
export function taxonomyLabel(
  rows: TaxonomyRow[],
  slug: string,
  language: string,
  fallback: (slug: string) => string,
): string {
  const riga = rows.find((r) => r.slug === slug);
  if (riga) return language === "it" ? riga.label_it : riga.label_en;

  const dai18n = fallback(slug);
  // i18n restituisce `[missing "..."]` invece di sollevare: e' testo, e a
  // schermo sembra un difetto dell'app. Meglio lo slug.
  return dai18n.includes("missing") ? slug : dai18n;
}

/**
 * Gli slug che la tassonomia conosce, CANCELLATI COMPRESI.
 *
 * Serve a filtrare quel che arriva dal catalogo, e li' un gruppo cancellato
 * dal pannello e' ancora uno slug noto: gli esercizi che lo nominano non
 * diventano sbagliati perche' non si offre piu' in una scelta.
 */
export const knownSlugs = (rows: TaxonomyRow[]): Set<string> =>
  new Set(rows.map((r) => r.slug));
