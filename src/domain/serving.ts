/**
 * Le porzioni di un alimento: le scorciatoie del campo quantita'.
 *
 * Un alimento memorizza i valori per 100 g e una porzione predefinita in
 * grammi (`default_serving_g`), piu' un'etichetta leggibile che la spiega
 * (`serving_label`, tipo "1 vasetto = 125 g"). Le scorciatoie scrivono grammi
 * nel campo: non sono una modalita' a parte, quindi non esiste uno stato
 * "porzioni" che possa discordare da quel che c'e' scritto.
 */

/**
 * I moltiplicatori offerti. Coprono il caso vero in entrambe le direzioni -
 * mezza mozzarella e tre cucchiai d'olio - senza diventare una fila da
 * scorrere.
 */
export const SERVING_MULTIPLIERS = [0.5, 1, 2, 3] as const;

/** Scarto tollerato nel riconoscere un multiplo: un centesimo di grammo. */
const TOLLERANZA_G = 0.01;

/** I grammi di `multiplier` porzioni. Zero se la porzione non e' utilizzabile. */
export const servingGrams = (servingG: number, multiplier: number): number =>
  servingG > 0 ? servingG * multiplier : 0;

/**
 * Il moltiplicatore che corrisponde a questi grammi, o `null`.
 *
 * `null` non e' un caso d'errore ed e' la risposta giusta il piu' delle volte:
 * 180 g non e' un numero di vasetti, e mostrare una scorciatoia accesa
 * affermerebbe il falso su quel che l'utente ha digitato.
 */
export function activeMultiplier(
  grams: number,
  servingG: number,
): number | null {
  if (servingG <= 0) return null;
  for (const multiplier of SERVING_MULTIPLIERS) {
    if (Math.abs(grams - servingG * multiplier) <= TOLLERANZA_G) {
      return multiplier;
    }
  }
  return null;
}

/**
 * Grammi come li scrive un italiano: virgola per i decimali, niente zeri in
 * coda. Il campo quantita' la riaccetta in lettura, quindi scrivere qui la
 * virgola non rompe la conferma.
 */
export const formatGrams = (grams: number): string =>
  String(Number(grams.toFixed(2))).replace(".", ",");

/**
 * Grammi da quel che si e' digitato. La virgola e' il separatore decimale
 * italiano, e un campo vuoto o assurdo vale zero: zero grammi esclude la riga
 * dal salvataggio invece di scriverne una a caso.
 *
 * Sta qui e non accanto a chi la usa perche' i consumatori sono due - la stima
 * da foto e la composizione di una voce - e una copia per ciascuno divergerebbe
 * alla prima correzione.
 */
export function toGrams(text: string): number {
  const parsed = Number(text.replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}
