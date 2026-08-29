export interface PerformedSet {
  weight: number;
  reps: number;
}

/** Oltre questa soglia la formula di Epley estrapola troppo per essere utile. */
const MAX_REPS_FOR_ESTIMATE = 12;

/**
 * Massimale stimato con la formula di Epley: peso * (1 + ripetizioni / 30).
 *
 * Ritorna null dove la stima non avrebbe senso (carico o ripetizioni non
 * positivi, o troppe ripetizioni): meglio nessun numero che un numero inventato.
 */
export function epley1RM(weight: number, reps: number): number | null {
  if (weight <= 0 || reps <= 0) return null;
  if (reps > MAX_REPS_FOR_ESTIMATE) return null;
  // Con una sola ripetizione il massimale è il carico stesso. La formula grezza
  // darebbe 1.033 volte il peso, che è un artefatto: se hai sollevato 100 kg
  // per una, il tuo massimale è 100, non 103.
  if (reps === 1) return weight;
  return weight * (1 + reps / 30);
}

/**
 * La serie migliore di un elenco, per massimale stimato e non per carico: otto
 * ripetizioni con 80 kg valgono più di una con 100.
 */
export function bestSet(sets: PerformedSet[]): PerformedSet | null {
  let best: PerformedSet | null = null;
  let bestEstimate = 0;

  for (const set of sets) {
    const estimate = epley1RM(set.weight, set.reps);
    if (estimate !== null && estimate > bestEstimate) {
      bestEstimate = estimate;
      best = set;
    }
  }
  return best;
}

/**
 * Carico proposto per la prossima volta.
 *
 * Si sale solo se l'ultima volta il target è stato centrato su tutte le serie
 * PREVISTE, non solo su quelle registrate: una seduta mollata a metà con due
 * serie buone su quattro non è una seduta riuscita, e salire lì sopra è il modo
 * più rapido per impantanarsi. Senza `targetSets` si valuta solo ciò che è
 * stato fatto, che è il massimo che si può sapere.
 */
export function suggestNextWeight(args: {
  lastSets: PerformedSet[];
  targetReps: number;
  increment: number;
  /** Serie previste dalla scheda. Omesso, si giudica sulle sole registrate. */
  targetSets?: number;
}): number | null {
  const working = args.lastSets.filter((s) => s.weight > 0);
  if (working.length === 0) return null;

  const heaviest = Math.max(...working.map((s) => s.weight));
  const completedAll =
    args.targetSets === undefined || working.length >= args.targetSets;
  const allHitTarget = working.every((s) => s.reps >= args.targetReps);

  return completedAll && allHitTarget ? heaviest + args.increment : heaviest;
}
