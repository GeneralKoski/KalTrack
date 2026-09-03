import { MEAL_TYPE_IDS } from "@/src/db/migrations";

/**
 * Il pasto che l'ora suggerisce.
 *
 * Serve a chi apre il foglio dal "+" senza partire da una sezione: il primo
 * pasto in ordine e' colazione a qualunque ora, e alle 20 costringeva a
 * cambiare selezione ogni volta.
 */

/** Fine di ciascuna fascia, in minuti dalla mezzanotte. */
const FASCE: { fino: number; id: string }[] = [
  { fino: 10 * 60 + 30, id: MEAL_TYPE_IDS.breakfast },
  { fino: 11 * 60 + 30, id: MEAL_TYPE_IDS.brunch },
  { fino: 15 * 60, id: MEAL_TYPE_IDS.lunch },
  { fino: 18 * 60, id: MEAL_TYPE_IDS.snack },
];

/**
 * L'id del pasto da preselezionare, o `null` se non ce n'e' nessuno.
 *
 * I pasti sono righe di database - si cancellano e se ne aggiungono di
 * propri - quindi quello dell'ora puo' non esserci: in quel caso vale il
 * primo dell'elenco, che e' l'ordine in cui li vede l'utente.
 */
export function defaultMealTypeId(
  mealTypes: { id: string }[],
  now: Date = new Date(),
): string | null {
  if (mealTypes.length === 0) return null;

  const minuti = now.getHours() * 60 + now.getMinutes();
  const atteso =
    FASCE.find((fascia) => minuti < fascia.fino)?.id ?? MEAL_TYPE_IDS.dinner;

  return mealTypes.find((type) => type.id === atteso)?.id ?? mealTypes[0].id;
}
