/**
 * Il confronto con un amico, e cosa deliberatamente NON si confronta.
 *
 * Trasformare un diario alimentare in una gara e' un modo noto per far
 * diventare il tracking un problema invece che uno strumento, quindi le
 * regole qui non sono tutte uguali:
 *
 * - **passi e allenamenti** si confrontano davvero. Sono attivita', "di piu'"
 *   vuol dire qualcosa, ed e' il tipo di spinta per cui uno aggiunge un amico.
 * - **le calorie** si mostrano affiancate ma senza vincitore. Mangiare piu' o
 *   meno di un'altra persona non e' meglio ne' peggio: dipende da quanto pesa,
 *   da quanto si muove e da cosa sta cercando di fare. Un segno di spunta su
 *   chi ne ha mangiate meno sarebbe un consiglio, e sarebbe sbagliato.
 * - **il peso** non si confronta e basta. "Pesi sei chili piu' del tuo amico"
 *   non e' un'informazione utile a nessuno, ed e' esattamente la frase che non
 *   deve comparire in un'app che si usa tutti i giorni.
 */

export type ComparisonMetric = "kcal" | "steps" | "workouts";

export interface ComparisonRow {
  metric: ComparisonMetric;
  mine: number | null;
  theirs: number | null;
  /**
   * Chi sta davanti, quando la domanda ha senso. `null` per le calorie, dove
   * un vincitore sarebbe un giudizio travestito da numero, e ogni volta che
   * manca un numero da una delle due parti.
   */
  ahead: "mine" | "theirs" | "tie" | null;
}

export interface DayTotals {
  kcal: number | null;
  steps: number | null;
  workouts: number | null;
}

/** Le metriche su cui "di piu'" e' una risposta e non un'opinione. */
const COMPARABLE: ReadonlySet<ComparisonMetric> = new Set([
  "steps",
  "workouts",
]);

const aheadOf = (
  metric: ComparisonMetric,
  mine: number | null,
  theirs: number | null,
): ComparisonRow["ahead"] => {
  if (!COMPARABLE.has(metric)) return null;
  // Un confronto con un numero mancante non e' un pareggio: e' una domanda a
  // cui non si puo' rispondere, e dire "sei avanti" perche' l'altro non ha
  // registrato i passi sarebbe una bugia.
  if (mine === null || theirs === null) return null;
  if (mine === theirs) return "tie";
  return mine > theirs ? "mine" : "theirs";
};

/**
 * Le righe del confronto, gia' filtrate.
 *
 * Una metrica che l'amico non condivide non compare: mostrarla vuota
 * inviterebbe a chiedersi perche', e la risposta - "ha scelto di non
 * condividerla" - e' una cosa che non serve rendere evidente ogni volta.
 */
export function buildComparison(
  mine: DayTotals,
  theirs: DayTotals,
  shares: { calories: boolean; steps: boolean; workouts: boolean },
): ComparisonRow[] {
  const attive: [ComparisonMetric, boolean][] = [
    ["kcal", shares.calories],
    ["steps", shares.steps],
    ["workouts", shares.workouts],
  ];

  return attive
    .filter(([, condivisa]) => condivisa)
    .map(([metric]) => ({
      metric,
      mine: mine[metric],
      theirs: theirs[metric],
      ahead: aheadOf(metric, mine[metric], theirs[metric]),
    }));
}
