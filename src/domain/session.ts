/** Una riga di serie a schermo, quel tanto che basta a riconoscerla. */
export interface PlannedRef {
  key: string;
  blockId: string;
  exerciseId: string;
  setIndex: number;
}

/** Una serie gia' scritta nel database. */
export interface LoggedRef {
  id: string;
  blockRef: string | null;
  exerciseId: string;
  setIndex: number;
}

/**
 * Riaggancia le serie gia' scritte alle righe della schermata, chiave della
 * riga -> id della serie.
 *
 * Serve a riprendere un allenamento a meta': `startSession` ritrova la sessione
 * aperta, ma senza questo lo schermo ripartiva con tutte le righe da spuntare e
 * rispuntarle scriveva serie doppie.
 *
 * **Ogni serie si consuma una volta sola.** Un blocco puo' contenere lo stesso
 * esercizio due volte - e' proprio cosi' che si scrive un dropset - e li'
 * blocco, esercizio e indice non bastano a distinguere due righe. Assegnare in
 * ordine, togliendo dal mazzo quel che e' gia' stato assegnato, tiene le due
 * righe separate invece di spuntarle entrambe con la stessa serie.
 *
 * Una serie che non corrisponde a nessuna riga resta fuori: capita a chi
 * cambia la scheda mentre l'allenamento e' aperto, e mostrarla da qualche parte
 * a caso sarebbe peggio che non mostrarla.
 */
export function matchLoggedSets(
  planned: PlannedRef[],
  logged: LoggedRef[],
): Record<string, string> {
  const taken = new Set<string>();
  const matched: Record<string, string> = {};

  for (const set of logged) {
    const row = planned.find(
      (candidate) =>
        !taken.has(candidate.key) &&
        candidate.exerciseId === set.exerciseId &&
        candidate.setIndex === set.setIndex &&
        // Una serie scritta senza riferimento al blocco vale per qualunque
        // blocco: e' come le scriveva l'assistente prima che il campo esistesse.
        (set.blockRef === null || candidate.blockId === set.blockRef),
    );
    if (!row) continue;
    taken.add(row.key);
    matched[row.key] = set.id;
  }

  return matched;
}
