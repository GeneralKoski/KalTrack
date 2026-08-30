/**
 * Il confronto con gli amici, e cosa deliberatamente NON si confronta.
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
 *   chi ne ha mangiate meno sarebbe un consiglio, e sarebbe sbagliato. Con
 *   cinque colonne la tentazione di ordinarle e' piu' forte ed e' la stessa
 *   tentazione sbagliata.
 * - **il peso** non si confronta e basta. "Pesi sei chili piu' del tuo amico"
 *   non e' un'informazione utile a nessuno, ed e' esattamente la frase che non
 *   deve comparire in un'app che si usa tutti i giorni.
 * - **la palestra** si confronta, ed e' l'unica regola nuova. Volume e carichi
 *   sono sport: li' "di piu'" vuol dire davvero qualcosa. La differenza con le
 *   calorie non e' arbitraria - un carico si allena, un fabbisogno no.
 */

export type ComparisonMetric = "kcal" | "steps" | "workouts";

export interface DayTotals {
  kcal: number | null;
  steps: number | null;
  workouts: number | null;
}

export interface ComparisonShares {
  calories: boolean;
  steps: boolean;
  workouts: boolean;
}

/** Un esercizio di un giorno, come arriva dal server. */
export interface SharedExercise {
  name: string;
  sets: number;
  totalReps: number;
  volumeKg: number;
  topWeightKg: number | null;
}

/**
 * Una persona nel confronto, con le proprie condivisioni al seguito.
 *
 * Le condivisioni stanno QUI e non in un elenco a parte: in un confronto a
 * cinque ognuno ha le sue, e tenerle in un array parallelo vorrebbe dire che
 * basta un ordinamento sbagliato per mostrare i numeri di uno sotto il nome di
 * un altro.
 */
export interface Participant {
  handle: string;
  displayName: string;
  totals: DayTotals;
  shares: ComparisonShares;
  /** Vuoto se non condivide la palestra: e' un elenco, non un numero. */
  exercises: SharedExercise[];
}

/** Il numero di una persona dentro una riga. */
export interface ComparisonCell {
  handle: string;
  value: number | null;
  /**
   * Vero per chi sta davanti, sulle metriche dove "davanti" vuol dire
   * qualcosa. A pari merito sono davanti tutti e due: un pareggio non ha un
   * vincitore da scegliere.
   */
  leading: boolean;
}

export interface ComparisonRow {
  metric: ComparisonMetric;
  cells: ComparisonCell[];
  /**
   * Se la riga ha un vincitore. Falso sulle calorie, dove un primo posto
   * sarebbe un giudizio travestito da numero.
   */
  ranked: boolean;
}

export interface GymRow {
  exercise: string;
  volume: ComparisonCell[];
  topWeight: ComparisonCell[];
}

/** Le metriche su cui "di piu'" e' una risposta e non un'opinione. */
const COMPARABLE: ReadonlySet<ComparisonMetric> = new Set([
  "steps",
  "workouts",
]);

/**
 * Segna chi sta davanti, quando la domanda ha senso.
 *
 * Due cose che non sono un dettaglio:
 *
 * - un numero mancante non partecipa. Chi non ha registrato non e' "quello che
 *   ha fatto meno", e metterlo ultimo sarebbe una bugia detta con un numero.
 * - con un solo numero non c'e' nessuna classifica. Essere primo su se stessi
 *   non vuol dire niente, e in un confronto a cinque in cui quattro non hanno
 *   registrato la coccarda andrebbe all'unico che ha aperto l'app.
 */
function markLeaders(cells: ComparisonCell[], ranked: boolean): ComparisonCell[] {
  if (!ranked) return cells;

  const presenti = cells.filter((c) => c.value !== null);
  if (presenti.length < 2) return cells;

  const massimo = Math.max(...presenti.map((c) => c.value as number));
  return cells.map((c) => ({ ...c, leading: c.value === massimo }));
}

const cell = (handle: string, value: number | null): ComparisonCell => ({
  handle,
  value,
  leading: false,
});

const shareOf = (shares: ComparisonShares, metric: ComparisonMetric): boolean =>
  metric === "kcal" ? shares.calories : shares[metric];

/**
 * Le righe del confronto fra me e fino a quattro altre persone.
 *
 * Una metrica compare se **almeno uno** degli altri la condivide, e per chi
 * non la condivide resta un trattino. Nascondere l'intera riga perche' uno
 * solo dei quattro non condivide i passi punirebbe gli altri tre, che li
 * avevano condivisi apposta.
 *
 * I miei numeri ci sono sempre: le mie condivisioni dicono cosa pubblico agli
 * altri, non cosa ho il permesso di vedere di me stesso.
 */
export function buildMultiComparison(
  mine: Participant,
  others: Participant[],
): ComparisonRow[] {
  const metriche: ComparisonMetric[] = ["kcal", "steps", "workouts"];

  return metriche
    .filter((metric) => others.some((p) => shareOf(p.shares, metric)))
    .map((metric) => {
      const ranked = COMPARABLE.has(metric);
      const cells = [
        cell(mine.handle, mine.totals[metric]),
        ...others.map((p) =>
          cell(p.handle, shareOf(p.shares, metric) ? p.totals[metric] : null),
        ),
      ];

      return { metric, cells: markLeaders(cells, ranked), ranked };
    });
}

/**
 * Il confronto in palestra, un esercizio per riga.
 *
 * Qui la classifica c'e' su entrambe le colonne, e ci sta: il volume e il
 * carico massimo sono la cosa su cui uno si allena apposta.
 *
 * Un esercizio compare se lo ha fatto almeno uno. Chi non lo ha fatto ha un
 * trattino e non uno zero: "non ha fatto panca oggi" e "ha fatto panca con
 * zero chili" sono due fatti diversi.
 */
export function buildGymComparison(
  mine: Participant,
  others: Participant[],
): GymRow[] {
  const tutti = [mine, ...others];

  // L'ordine e' quello in cui gli esercizi compaiono, a partire dai miei:
  // guardo il mio allenamento con accanto il loro, non un elenco alfabetico
  // in cui devo cercare quello che ho fatto io.
  const nomi: string[] = [];
  for (const persona of tutti) {
    for (const esercizio of persona.exercises) {
      if (!nomi.includes(esercizio.name)) nomi.push(esercizio.name);
    }
  }

  return nomi.map((exercise) => {
    const trovato = (p: Participant) =>
      p.exercises.find((e) => e.name === exercise) ?? null;

    return {
      exercise,
      volume: markLeaders(
        tutti.map((p) => cell(p.handle, trovato(p)?.volumeKg ?? null)),
        true,
      ),
      topWeight: markLeaders(
        tutti.map((p) => cell(p.handle, trovato(p)?.topWeightKg ?? null)),
        true,
      ),
    };
  });
}
