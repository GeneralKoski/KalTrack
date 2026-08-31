import {
  EMPTY_NUTRIENTS,
  scaleNutrients,
  sumNutrients,
  type Nutrients,
  type RecipeNode,
} from "@/src/domain/nutrition";

/**
 * Un ingrediente dentro una voce del diario.
 *
 * `label` e `per100` sono COPIATI dall'alimento e non letti da lui: una voce
 * del diario e' una fotografia, e deve sopravvivere intatta a una rinomina o a
 * una cancellazione del suo ingrediente. `foodId` dice da dove veniva e non e'
 * la fonte dei numeri - puo' anche mancare, per un ingrediente scritto a mano.
 */
export interface EntryComponent {
  foodId: string | null;
  label: string;
  quantityG: number;
  per100: Nutrients;
}

export interface EntryComposition {
  /**
   * `true` quando l'utente ha cambiato qualcosa.
   *
   * Non e' un dettaglio interno: il diario lo scrive accanto al nome, perche'
   * altrimenti si legge "Crepes di zucchine", si riconosce il nome della
   * ricetta e si crede di vedere la ricetta - mentre dentro c'e' il salame.
   */
  edited: boolean;
  items: EntryComponent[];
}

/**
 * Gli ingredienti di una ricetta, appiattiti e scalati alle porzioni mangiate.
 *
 * Piatto e non annidato di proposito: se le crepes contenessero una
 * besciamella, con l'annidamento non si potrebbe togliere il prosciutto senza
 * scendere di livello - e togliere il prosciutto e' il caso d'uso. Il prezzo e'
 * che dentro la voce si perde il raggruppamento della sotto-ricetta.
 */
export function flattenRecipe(
  node: RecipeNode,
  servings: number,
): EntryComponent[] {
  // Una ricetta che dichiara zero porzioni vale una: la stessa regola di
  // `recipePerServing`, e senza di essa qui si dividerebbe per zero.
  const rese = node.servings > 0 ? node.servings : 1;
  const fattore = servings / rese;

  const items: EntryComponent[] = [];
  for (const item of node.items) {
    if (item.kind === "food") {
      items.push({
        foodId: item.foodId,
        label: item.label,
        quantityG: item.grams * fattore,
        per100: item.per100,
      });
      continue;
    }
    // La sotto-ricetta si apre: le sue porzioni sono porzioni di quella,
    // moltiplicate per il fattore di questo livello.
    items.push(...flattenRecipe(item.child, item.servings * fattore));
  }
  return items;
}

export const componentNutrients = (component: EntryComponent): Nutrients =>
  scaleNutrients(component.per100, component.quantityG);

export const compositionNutrients = (
  composition: EntryComposition,
): Nutrients => sumNutrients(composition.items.map(componentNutrients));

/**
 * Tutti gli ingredienti per lo stesso fattore: e' il cambio di porzioni.
 *
 * NON marca `edited`: mangiare due porzioni invece di una non e' una modifica
 * della composizione, sono le stesse crepes in quantita' diversa.
 */
export function rescaleComposition(
  composition: EntryComposition,
  factor: number,
): EntryComposition {
  if (factor <= 0) return composition;
  return {
    ...composition,
    items: composition.items.map((item) => ({
      ...item,
      quantityG: item.quantityG * factor,
    })),
  };
}

const modificata = (items: EntryComponent[]): EntryComposition => ({
  edited: true,
  items,
});

export function setComponentGrams(
  composition: EntryComposition,
  index: number,
  grams: number,
): EntryComposition {
  if (index < 0 || index >= composition.items.length) return composition;
  return modificata(
    composition.items.map((item, i) =>
      i === index ? { ...item, quantityG: grams } : item,
    ),
  );
}

export function removeComponent(
  composition: EntryComposition,
  index: number,
): EntryComposition {
  if (index < 0 || index >= composition.items.length) return composition;
  return modificata(composition.items.filter((_, i) => i !== index));
}

export const addComponent = (
  composition: EntryComposition,
  component: EntryComponent,
): EntryComposition => modificata([...composition.items, component]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const NUTRIENT_KEYS = Object.keys(EMPTY_NUTRIENTS) as (keyof Nutrients)[];

/**
 * I nutrienti letti dal JSON, con gli zeri al posto di quel che manca.
 *
 * Un `undefined` dentro `Nutrients` non lo prende nessun consumatore: le somme
 * diventerebbero NaN e il diario mostrerebbe totali vuoti senza dire perche'.
 */
const readNutrients = (value: unknown): Nutrients => {
  const source = isRecord(value) ? value : {};
  const result = { ...EMPTY_NUTRIENTS };
  for (const key of NUTRIENT_KEYS) {
    const n = source[key];
    result[key] = typeof n === "number" && Number.isFinite(n) ? n : 0;
  }
  return result;
};

const readComponent = (value: unknown): EntryComponent | null => {
  if (!isRecord(value)) return null;
  const { foodId, label, quantityG, per100 } = value;
  if (typeof label !== "string" || label.trim() === "") return null;
  if (typeof quantityG !== "number" || !Number.isFinite(quantityG)) return null;
  return {
    foodId: typeof foodId === "string" ? foodId : null,
    label,
    quantityG,
    per100: readNutrients(per100),
  };
};

/**
 * Rilegge la colonna. **Non lancia mai.**
 *
 * `null` non e' un errore: e' una voce che non ha una composizione - tutte
 * quelle scritte prima della migrazione 10. JSON rotto o di forma sconosciuta
 * finisce li' allo stesso modo, e la voce si disegna come prima invece di dare
 * una schermata bianca per una colonna accessoria.
 */
export function parseComposition(raw: string | null): EntryComposition | null {
  if (raw === null || raw.trim() === "") return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.items)) return null;

  const items = parsed.items
    .map(readComponent)
    .filter((item): item is EntryComponent => item !== null);

  return { edited: parsed.edited === true, items };
}

export const serializeComposition = (composition: EntryComposition): string =>
  JSON.stringify(composition);
