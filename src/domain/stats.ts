/**
 * Media dei valori presenti. Un giorno senza misura (`null`) non conta come
 * zero: non aver registrato non è aver camminato zero passi.
 * Ritorna null quando non c'è nessuna misura.
 */
export function average(values: (number | null)[]): number | null {
  const present = values.filter((v): v is number => v !== null);
  if (present.length === 0) return null;
  return present.reduce((sum, v) => sum + v, 0) / present.length;
}

/**
 * Media mobile con finestra crescente all'inizio della serie: i primi punti
 * usano tutti i valori disponibili invece di sparire.
 */
export function movingAverage(values: number[], window: number): number[] {
  return values.map((_, index) => {
    const from = Math.max(0, index - window + 1);
    const slice = values.slice(from, index + 1);
    return slice.reduce((sum, v) => sum + v, 0) / slice.length;
  });
}

export interface SparkPoint {
  x: number;
  y: number;
}

/**
 * Normalizza una serie in punti dentro un'area width x height, pronti per un
 * path SVG. y cresce verso il basso, quindi il massimo finisce a y = 0.
 * Una serie piatta viene disegnata a metà altezza invece di collassare sul
 * bordo, che sembrerebbe un errore.
 */
export function buildSparkline(
  values: number[],
  width: number,
  height: number,
): SparkPoint[] {
  if (values.length === 0) return [];
  if (values.length === 1) return [{ x: width / 2, y: height / 2 }];

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;

  return values.map((value, index) => ({
    x: (index / (values.length - 1)) * width,
    y: span === 0 ? height / 2 : height - ((value - min) / span) * height,
  }));
}
