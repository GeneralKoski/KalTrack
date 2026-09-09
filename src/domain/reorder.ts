/**
 * Lo spostamento di un elemento in un elenco riordinabile a trascinamento.
 *
 * La mappa e' `id -> indice`, e non un array, perche' e' quel che vive in uno
 * shared value di reanimated: ogni riga legge la propria posizione e si sposta
 * per conto suo, senza che l'elenco si ridisegni a ogni pixel.
 *
 * Sta qui e non dentro una schermata perche' due schermate la usano - i
 * promemoria e le schede di allenamento - e una seconda copia di questo
 * calcolo sarebbe due comportamenti da tenere allineati a mano.
 *
 * E' un worklet: gira sul thread dell'interfaccia, dentro `onUpdate` del
 * gesto.
 */
export const movePosition = (
  positions: Record<string, number>,
  from: number,
  to: number,
): Record<string, number> => {
  "worklet";
  const next: Record<string, number> = {};
  for (const key of Object.keys(positions)) {
    const value = positions[key];
    if (value === from) {
      next[key] = to;
    } else if (from < to && value > from && value <= to) {
      next[key] = value - 1;
    } else if (from > to && value >= to && value < from) {
      next[key] = value + 1;
    } else {
      next[key] = value;
    }
  }
  return next;
};
