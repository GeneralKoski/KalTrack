import type { Migration } from "@/src/db/migrations/types";

/**
 * La composizione di una voce del diario.
 *
 * Una voce nata da una ricetta puntava soltanto alla ricetta, e gli ingredienti
 * stavano in `recipe_items`, che appartiene alla ricetta ed e' condivisa da
 * tutte le voci che la citano: dire "oggi 160 g di zucchine invece di 140"
 * avrebbe cambiato anche le crepes mangiate il mese scorso.
 *
 * E' una colonna e non una tabella figlia per due ragioni.
 *
 * La prima e' che `CLAUDE.md` registra gia' il difetto delle riscritture in
 * blocco degli ingredienti - cancellare e reinserire con id nuovi accumula
 * duplicati sull'altro telefono - e una composizione si riscrive intera a ogni
 * modifica: con un valore solo quella trappola non puo' esistere, perche' non
 * ci sono righe da riconciliare.
 *
 * La seconda e' che la voce e' gia' una fotografia, coi valori nutrizionali
 * congelati nella riga. Congelare anche la composizione e' coerente; una
 * tabella figlia con chiavi esterne verso alimenti vivi direbbe il contrario.
 *
 * NULL vuol dire "voce senza composizione", ed e' il caso di tutte quelle
 * scritte prima di qui. La sincronizzazione non richiede niente: e' generica, e
 * una versione dell'app che non conosce questa colonna la ignora.
 */
export const migration010: Migration = {
  version: 10,
  name: "entry_components",
  up: `
ALTER TABLE meal_entries ADD COLUMN components TEXT;
`,
};
