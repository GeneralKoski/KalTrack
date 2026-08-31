# Composizione per voce del diario - Piano di implementazione

> **Chiuso il 31 agosto 2026.** Sette task su sette. Due scelte sono cambiate
> in corso d'opera e sono annotate in testa alla spec. Il Task 1 e' costato piu'
> del previsto: il piano contava tre letterali da aggiornare, il typecheck ne ha
> trovati sette.

> **Per chi esegue:** SOTTO-SKILL RICHIESTA: usa
> `superpowers:subagent-driven-development` oppure
> `superpowers:executing-plans` per eseguirlo task per task. I passi usano
> caselle (`- [ ]`) per tenere il segno.

**Obiettivo:** una voce del diario nata da una ricetta porta la **propria**
composizione, modificabile ingrediente per ingrediente, senza toccare la ricetta
né le altre voci.

**Architettura:** la composizione vive in una colonna JSON `components` su
`meal_entries` (migrazione 10), non in una tabella figlia. L'elenco è **piatto**
(solo alimenti) e **congelato** (etichetta e valori per 100 g copiati dentro),
coerente con la voce del diario che è già una fotografia. I valori della voce
sono sempre la somma dei suoi elementi.

**Stack:** React Native 0.83 + Expo 55, expo-sqlite, TypeScript strict, Jest con
better-sqlite3 in memoria.

**Spec:** `docs/superpowers/specs/2026-08-31-composizione-per-voce-design.md`

## Vincoli globali

- Mai `DELETE FROM` su una tabella sincronizzata. Qui non serve: la
  composizione è un valore, non righe.
- Ogni testo visibile via `t("chiave")`, chiavi in `src/i18n/locales/it.json`.
- Token da `@/src/styles`, mai hex inline. `TouchableOpacity` con
  `activeOpacity={0.6}`, `hitSlop={8}` sui bersagli piccoli.
- `Text` e `TextInput` da `@/src/components/ui`, mai le primitive RN nude.
- TypeScript strict, mai `any`. Logging solo via `logger`.
- Import assoluti con `@/`, mai `../`.
- Le schermate non contengono SQL: tutto in `src/db/queries/`.
- Gate di verifica: `npm run typecheck && npm run lint && npm test`.
- **Una seconda sessione lavora sullo stesso repo.** Mettere in stage solo
  percorsi espliciti, mai `git add -A`. Rileggere ogni file prima di
  modificarlo. La migrazione è la **10**.

## Struttura dei file

| File | Responsabilità |
|---|---|
| `src/domain/nutrition.ts` | *(modifica)* `RecipeItemNode` porta `foodId` e `label` |
| `src/domain/entryComposition.ts` | *(nuovo)* tutta la logica pura: appiattire, scalare, modificare, serializzare |
| `src/db/migrations/010_entry_components.ts` | *(nuovo)* la colonna |
| `src/db/queries/recipes.ts` | *(modifica)* il builder riempie identità e nome |
| `src/db/queries/diary.ts` | *(modifica)* leggere/scrivere `components`, ricalcolare la fotografia |
| `src/containers/diary/EntryRow.tsx` | *(modifica)* elenco apribile e marcatore "modificata" |
| `src/containers/diary/EntryCompositionSheet.tsx` | *(nuovo)* il foglio di modifica |
| `src/containers/diary/QuickFoodSheet.tsx` | *(nuovo)* creare un alimento senza uscire |
| `src/navigation/screens/TodayScreen.tsx` | *(modifica)* apre il foglio per le voci da ricetta |

---

### Task 1: il nodo della ricetta porta l'identità

**File:**
- Modifica: `src/domain/nutrition.ts:85-87`
- Modifica: `src/db/queries/recipes.ts:93-97`
- Test: `src/domain/nutrition.test.ts:122-134`

**Interfacce:**
- Produce: `RecipeItemNode` variante food = `{ kind: "food"; foodId: string; label: string; per100: Nutrients; grams: number }`

`buildRecipeTree` legge la riga dell'alimento e ne butta via nome e id: senza
quelli la composizione di una voce non può avere etichette, e un'etichetta
generica renderebbe l'elenco inutile.

- [ ] **Passo 1: estendere il tipo**

In `src/domain/nutrition.ts`:

```ts
export type RecipeItemNode =
  | {
      kind: "food";
      /** Da dove viene l'ingrediente. Non e' la fonte dei valori: quelli si copiano. */
      foodId: string;
      label: string;
      per100: Nutrients;
      grams: number;
    }
  | { kind: "recipe"; child: RecipeNode; servings: number };
```

- [ ] **Passo 2: eseguire typecheck per vedere cosa si rompe**

Run: `npx tsc --noEmit`
Atteso: errori in `src/db/queries/recipes.ts` e `src/domain/nutrition.test.ts`
(proprietà mancanti). Nessun altro file: `DraftItem` di `RecipeFormScreen` è un
tipo suo e ha già `foodId` e `name`.

- [ ] **Passo 3: riempirli nel builder**

In `src/db/queries/recipes.ts`, dentro `buildRecipeTree`:

```ts
      items.push({
        kind: "food",
        foodId: food.id,
        label: food.name,
        per100: foodNutrients(food),
        grams: row.quantity_g ?? 0,
      });
```

- [ ] **Passo 4: aggiornare i tre letterali nei test**

In `src/domain/nutrition.test.ts`, aggiungere `foodId` e `label` ai tre
`{ kind: "food", ... }` esistenti, per esempio:

```ts
        { kind: "food", foodId: "f1", label: "Pollo", per100: CHICKEN, grams: 200 },
```

- [ ] **Passo 5: verificare**

Run: `npx tsc --noEmit && npx jest src/domain/nutrition.test.ts`
Atteso: nessun errore, test verdi.

- [ ] **Passo 6: commit**

```bash
git add src/domain/nutrition.ts src/domain/nutrition.test.ts src/db/queries/recipes.ts
git commit -m "refactor(domain): keep the ingredient's identity in the recipe tree"
```

---

### Task 2: la logica pura della composizione

**File:**
- Crea: `src/domain/entryComposition.ts`
- Test: `src/domain/entryComposition.test.ts`

**Interfacce:**
- Consuma: `RecipeNode`, `RecipeItemNode` (Task 1), `scaleNutrients`,
  `sumNutrients`, `Nutrients` da `@/src/domain/nutrition`
- Produce:
  - `interface EntryComponent { foodId: string | null; label: string; quantityG: number; per100: Nutrients }`
  - `interface EntryComposition { edited: boolean; items: EntryComponent[] }`
  - `flattenRecipe(node: RecipeNode, servings: number): EntryComponent[]`
  - `componentNutrients(c: EntryComponent): Nutrients`
  - `compositionNutrients(c: EntryComposition): Nutrients`
  - `rescaleComposition(c: EntryComposition, factor: number): EntryComposition`
  - `setComponentGrams(c: EntryComposition, index: number, grams: number): EntryComposition`
  - `removeComponent(c: EntryComposition, index: number): EntryComposition`
  - `addComponent(c: EntryComposition, component: EntryComponent): EntryComposition`
  - `parseComposition(raw: string | null): EntryComposition | null`
  - `serializeComposition(c: EntryComposition): string`

- [ ] **Passo 1: scrivere i test che falliscono**

Crea `src/domain/entryComposition.test.ts`:

```ts
import {
  addComponent,
  compositionNutrients,
  componentNutrients,
  flattenRecipe,
  parseComposition,
  removeComponent,
  rescaleComposition,
  serializeComposition,
  setComponentGrams,
  type EntryComponent,
  type EntryComposition,
} from "@/src/domain/entryComposition";
import { EMPTY_NUTRIENTS, type Nutrients, type RecipeNode } from "@/src/domain/nutrition";

const nutrients = (partial: Partial<Nutrients>): Nutrients => ({
  ...EMPTY_NUTRIENTS,
  ...partial,
});

const ZUCCHINE = nutrients({ kcal: 17, carbs: 3 });
const FARINA = nutrients({ kcal: 340, carbs: 70 });

const CREPES: RecipeNode = {
  servings: 2,
  items: [
    { kind: "food", foodId: "z", label: "Zucchine", per100: ZUCCHINE, grams: 140 },
    { kind: "food", foodId: "f", label: "Farina", per100: FARINA, grams: 70 },
  ],
};

const composizione = (items: EntryComponent[], edited = false): EntryComposition => ({
  edited,
  items,
});

describe("flattenRecipe", () => {
  it("copia gli ingredienti con etichetta e valori per 100 g", () => {
    const items = flattenRecipe(CREPES, 2);

    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({
      foodId: "z",
      label: "Zucchine",
      quantityG: 140,
      per100: ZUCCHINE,
    });
  });

  // La ricetta rende 2 porzioni: mangiarne una vuol dire meta' di tutto.
  it("scala alle porzioni mangiate", () => {
    const items = flattenRecipe(CREPES, 1);
    expect(items[0].quantityG).toBe(70);
    expect(items[1].quantityG).toBe(35);
  });

  it("appiattisce una sotto-ricetta invece di annidarla", () => {
    const conSalsa: RecipeNode = {
      servings: 1,
      items: [
        { kind: "food", foodId: "f", label: "Farina", per100: FARINA, grams: 100 },
        { kind: "recipe", child: CREPES, servings: 1 },
      ],
    };

    const items = flattenRecipe(conSalsa, 1);

    expect(items.map((i) => i.label)).toEqual(["Farina", "Zucchine", "Farina"]);
    // Una porzione delle crepes = meta' dei suoi 140 g di zucchine.
    expect(items[1].quantityG).toBe(70);
  });

  it("con una ricetta a zero porzioni la tratta come una sola", () => {
    const items = flattenRecipe({ ...CREPES, servings: 0 }, 1);
    expect(items[0].quantityG).toBe(140);
  });
});

describe("componentNutrients", () => {
  it("scala i valori per 100 g ai grammi dell'ingrediente", () => {
    const valori = componentNutrients({
      foodId: "z",
      label: "Zucchine",
      quantityG: 200,
      per100: ZUCCHINE,
    });
    expect(valori.kcal).toBeCloseTo(34);
  });
});

describe("compositionNutrients", () => {
  it("somma gli ingredienti", () => {
    const totale = compositionNutrients(composizione(flattenRecipe(CREPES, 2)));
    // 140 g a 17 kcal/100 + 70 g a 340 kcal/100
    expect(totale.kcal).toBeCloseTo(23.8 + 238);
  });

  it("una composizione vuota vale zero, non NaN", () => {
    expect(compositionNutrients(composizione([]))).toEqual(EMPTY_NUTRIENTS);
  });
});

describe("rescaleComposition", () => {
  it("moltiplica ogni ingrediente", () => {
    const doppia = rescaleComposition(composizione(flattenRecipe(CREPES, 1)), 2);
    expect(doppia.items[0].quantityG).toBe(140);
    expect(doppia.items[1].quantityG).toBe(70);
  });

  // Riscalare e' un cambio di porzioni, non una modifica della composizione:
  // le crepes restano quelle della ricetta, sono solo di piu'.
  it("non marca la composizione come modificata", () => {
    const doppia = rescaleComposition(composizione(flattenRecipe(CREPES, 1)), 2);
    expect(doppia.edited).toBe(false);
  });

  it("con un fattore non positivo non cambia niente", () => {
    const partenza = composizione(flattenRecipe(CREPES, 1));
    expect(rescaleComposition(partenza, 0)).toEqual(partenza);
    expect(rescaleComposition(partenza, -1)).toEqual(partenza);
  });
});

describe("setComponentGrams", () => {
  it("cambia i grammi di un solo ingrediente", () => {
    const dopo = setComponentGrams(composizione(flattenRecipe(CREPES, 2)), 0, 160);
    expect(dopo.items[0].quantityG).toBe(160);
    expect(dopo.items[1].quantityG).toBe(70);
  });

  // Da qui viene il "modificata" accanto al nome: senza, si legge il nome della
  // ricetta e si crede di vedere la ricetta.
  it("marca la composizione come modificata", () => {
    const dopo = setComponentGrams(composizione(flattenRecipe(CREPES, 2)), 0, 160);
    expect(dopo.edited).toBe(true);
  });

  it("su un indice inesistente non cambia niente", () => {
    const partenza = composizione(flattenRecipe(CREPES, 2));
    expect(setComponentGrams(partenza, 9, 160)).toEqual(partenza);
  });
});

describe("removeComponent", () => {
  it("toglie l'ingrediente e marca la modifica", () => {
    const dopo = removeComponent(composizione(flattenRecipe(CREPES, 2)), 0);
    expect(dopo.items.map((i) => i.label)).toEqual(["Farina"]);
    expect(dopo.edited).toBe(true);
  });

  it("puo' svuotare la composizione", () => {
    const uno = composizione([flattenRecipe(CREPES, 2)[0]]);
    expect(removeComponent(uno, 0).items).toEqual([]);
  });
});

describe("addComponent", () => {
  it("aggiunge in coda e marca la modifica", () => {
    const salame: EntryComponent = {
      foodId: "s",
      label: "Salame piccante",
      quantityG: 40,
      per100: nutrients({ kcal: 400 }),
    };

    const dopo = addComponent(composizione(flattenRecipe(CREPES, 2)), salame);

    expect(dopo.items).toHaveLength(3);
    expect(dopo.items[2].label).toBe("Salame piccante");
    expect(dopo.edited).toBe(true);
  });
});

describe("parseComposition", () => {
  it("rilegge quel che ha scritto", () => {
    const partenza = composizione(flattenRecipe(CREPES, 2), true);
    expect(parseComposition(serializeComposition(partenza))).toEqual(partenza);
  });

  it("su NULL torna null: e' una voce che non ne ha una", () => {
    expect(parseComposition(null)).toBeNull();
  });

  /*
   * JSON rotto o di una forma che non conosciamo: torna null e la voce si
   * disegna come prima. Un'eccezione qui sarebbe una schermata bianca per una
   * colonna che ha valore accessorio.
   */
  it("su JSON invalido torna null invece di lanciare", () => {
    expect(parseComposition("{non json")).toBeNull();
    expect(parseComposition("[]")).toBeNull();
    expect(parseComposition('{"items":"no"}')).toBeNull();
  });

  it("scarta gli elementi malformati e tiene i buoni", () => {
    const raw = JSON.stringify({
      edited: true,
      items: [
        { foodId: "z", label: "Zucchine", quantityG: 140, per100: ZUCCHINE },
        { label: "senza grammi", per100: ZUCCHINE },
      ],
    });

    const letta = parseComposition(raw);

    expect(letta?.items).toHaveLength(1);
    expect(letta?.items[0].label).toBe("Zucchine");
  });
});
```

- [ ] **Passo 2: eseguire i test per vederli fallire**

Run: `npx jest src/domain/entryComposition.test.ts`
Atteso: FAIL con "Cannot find module '@/src/domain/entryComposition'"

- [ ] **Passo 3: scrivere l'implementazione**

Crea `src/domain/entryComposition.ts`:

```ts
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
 * la fonte dei numeri.
 */
export interface EntryComponent {
  foodId: string | null;
  label: string;
  quantityG: number;
  per100: Nutrients;
}

export interface EntryComposition {
  /**
   * `true` quando l'utente ha cambiato qualcosa. Non e' un dettaglio interno:
   * il diario lo scrive accanto al nome, perche' altrimenti si legge "Crepes
   * di zucchine" e si crede di vedere la ricetta mentre dentro c'e' il salame.
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
  // `recipePerServing`, e senza di essa si dividerebbe per zero.
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
    // La sotto-ricetta si apre: le sue porzioni diventano porzioni di quella,
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

const modificata = (
  composition: EntryComposition,
  items: EntryComponent[],
): EntryComposition => ({ edited: true, items });

export function setComponentGrams(
  composition: EntryComposition,
  index: number,
  grams: number,
): EntryComposition {
  if (index < 0 || index >= composition.items.length) return composition;
  return modificata(
    composition,
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
  return modificata(
    composition,
    composition.items.filter((_, i) => i !== index),
  );
}

export const addComponent = (
  composition: EntryComposition,
  component: EntryComponent,
): EntryComposition => modificata(composition, [...composition.items, component]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readNutrients = (value: unknown): Nutrients => {
  const source = isRecord(value) ? value : {};
  const result = { ...EMPTY_NUTRIENTS };
  for (const key of Object.keys(EMPTY_NUTRIENTS) as (keyof Nutrients)[]) {
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
 * quelle scritte prima della migrazione 10. JSON rotto o di una forma
 * sconosciuta finisce li' allo stesso modo: la voce si disegna come prima,
 * invece di dare una schermata bianca per una colonna accessoria.
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

export const serializeComposition = (
  composition: EntryComposition,
): string => JSON.stringify(composition);
```

- [ ] **Passo 4: eseguire i test**

Run: `npx jest src/domain/entryComposition.test.ts`
Atteso: tutti verdi.

- [ ] **Passo 5: commit**

```bash
git add src/domain/entryComposition.ts src/domain/entryComposition.test.ts
git commit -m "feat(domain): a diary entry's own composition"
```

---

### Task 3: la colonna e le query

**File:**
- Crea: `src/db/migrations/010_entry_components.ts`
- Modifica: `src/db/migrations/index.ts`
- Modifica: `src/db/queries/diary.ts` (`addRecipeEntry`, `updateEntryQuantity`, nuove funzioni)
- Modifica: `src/types/nutrition.ts` (`MealEntryRow` porta `components`)
- Test: `src/db/queries/diary.test.ts`

**Interfacce:**
- Consuma: tutto `@/src/domain/entryComposition` (Task 2)
- Produce:
  - `getEntryComposition(entryId: string): Promise<EntryComposition | null>`
  - `materializeComposition(entryId: string): Promise<EntryComposition | null>`
  - `saveEntryComposition(entryId: string, composition: EntryComposition): Promise<void>`

- [ ] **Passo 1: la migrazione**

Crea `src/db/migrations/010_entry_components.ts`:

```ts
import type { Migration } from "@/src/db/migrations/types";

/**
 * La composizione di una voce del diario.
 *
 * Una voce nata da una ricetta puntava solo alla ricetta, e gli ingredienti
 * stavano in `recipe_items`, condivisa da tutte le voci che la citano: dire
 * "oggi 160 g di zucchine invece di 140" avrebbe cambiato anche le crepes
 * mangiate il mese scorso.
 *
 * E' una colonna e non una tabella figlia per due ragioni. La prima e' che
 * `CLAUDE.md` registra gia' il difetto delle riscritture in blocco degli
 * ingredienti - cancellare e reinserire accumula duplicati sull'altro telefono
 * - e una composizione si riscrive intera a ogni modifica: con un valore solo
 * quella trappola non esiste. La seconda e' che la voce e' gia' una fotografia,
 * coi valori congelati nella riga: congelare anche la composizione e' coerente,
 * una tabella figlia con chiavi esterne verso alimenti vivi direbbe il
 * contrario.
 *
 * NULL vuol dire "voce senza composizione", ed e' il caso di tutte quelle
 * scritte prima di qui.
 */
export const migration010: Migration = {
  version: 10,
  name: "entry_components",
  up: `
ALTER TABLE meal_entries ADD COLUMN components TEXT;
`,
};
```

- [ ] **Passo 2: registrarla**

In `src/db/migrations/index.ts` aggiungere l'import dopo `migration009` e
`migration010,` in coda a `MIGRATIONS`.

- [ ] **Passo 3: la colonna nel tipo di riga**

In `src/types/nutrition.ts`, dentro `MealEntryRow`, accanto a `photo_uri`:

```ts
  /** JSON della composizione, o NULL per una voce che non ne ha. */
  components: string | null;
```

- [ ] **Passo 4: scrivere i test che falliscono**

Aggiungere in `src/db/queries/diary.test.ts`. Il setup sta in un helper
condiviso: ripeterlo in cinque test lo rende cinque cose da tenere allineate.

```ts
/** Ricetta da due porzioni con 140 g di zucchine, e una voce da una porzione. */
async function setupCrepes(): Promise<{
  entryId: string;
  recipeId: string;
  foodId: string;
}> {
  const foodId = await createFood({
    name: "Zucchine",
    source: "user",
    nutrients: { ...EMPTY_NUTRIENTS, kcal: 17 },
  });
  const recipeId = await createRecipe({
    name: "Crepes",
    servings: 2,
    items: [{ foodId, quantityG: 140 }],
  });
  const entryId = await addRecipeEntry({
    date: "2026-08-31",
    mealTypeId: MEAL_TYPE_IDS.lunch,
    recipeId,
    servings: 1,
  });
  return { entryId, recipeId, foodId };
}

/** Azzera la colonna: e' lo stato di una voce scritta prima della migrazione 10. */
async function forgetComposition(entryId: string): Promise<void> {
  const db = await getDb();
  await db.runAsync("UPDATE meal_entries SET components = NULL WHERE id = ?", [
    entryId,
  ]);
}

describe("composizione di una voce", () => {
  it("una voce da ricetta nasce con la composizione della ricetta", async () => {
    const { entryId } = await setupCrepes();

    const composizione = await getEntryComposition(entryId);
    expect(composizione?.edited).toBe(false);
    expect(composizione?.items).toHaveLength(1);
    // Una delle due porzioni: meta' dei 140 g.
    expect(composizione?.items[0].quantityG).toBeCloseTo(70);
  });

  it("salvare una composizione ricalcola i valori della voce", async () => {
    const { entryId } = await setupCrepes();
    const composizione = await getEntryComposition(entryId);
    if (!composizione) throw new Error("composizione attesa");

    await saveEntryComposition(entryId, setComponentGrams(composizione, 0, 200));

    const db = await getDb();
    const entry = await db.getFirstAsync<{ kcal: number }>(
      "SELECT kcal FROM meal_entries WHERE id = ?",
      [entryId],
    );
    // 200 g a 17 kcal/100 g.
    expect(entry?.kcal).toBeCloseTo(34);
  });

  /*
   * Il difetto che questo lavoro chiude: prima le porzioni rileggevano la
   * ricetta viva, quindi modificare la ricetta e poi toccare le porzioni di
   * una voce vecchia la aggiornava ai valori nuovi.
   */
  it("cambiare le porzioni non rilegge la ricetta", async () => {
    const { entryId, recipeId, foodId: zucchine } = await setupCrepes();

    await updateRecipe(recipeId, {
      name: "Crepes",
      servings: 2,
      items: [{ foodId: zucchine, quantityG: 999 }],
    });

    await updateEntryQuantity(entryId, 2);

    const composizione = await getEntryComposition(entryId);
    // 70 g raddoppiati, non i 999 della ricetta cambiata.
    expect(composizione?.items[0].quantityG).toBeCloseTo(140);
  });

  it("una voce senza composizione la materializza dalla ricetta", async () => {
    const { entryId } = await setupCrepes();
    await forgetComposition(entryId);

    const composizione = await materializeComposition(entryId);

    expect(composizione?.items).toHaveLength(1);
    expect(await getEntryComposition(entryId)).not.toBeNull();
  });

  it("se la ricetta non esiste piu' la materializzazione torna null", async () => {
    const { entryId, recipeId } = await setupCrepes();
    await deleteRecipe(recipeId);
    await forgetComposition(entryId);

    await expect(materializeComposition(entryId)).resolves.toBeNull();
  });
});
```

- [ ] **Passo 5: eseguire i test per vederli fallire**

Run: `npx jest src/db/queries/diary.test.ts`
Atteso: FAIL, `getEntryComposition` non esiste.

- [ ] **Passo 6: implementare in `src/db/queries/diary.ts`**

```ts
/** La composizione della voce, o null se non ne ha una. */
export async function getEntryComposition(
  entryId: string,
): Promise<EntryComposition | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ components: string | null }>(
    "SELECT components FROM meal_entries WHERE id = ? AND deleted_at IS NULL",
    [entryId],
  );
  return parseComposition(row?.components ?? null);
}

/**
 * Scrive la composizione e ricalcola la fotografia della voce.
 *
 * I valori della voce sono la somma dei suoi ingredienti: scrivere l'una senza
 * l'altra lascerebbe il diario a mostrare i vecchi totali sotto ingredienti
 * nuovi.
 */
export async function saveEntryComposition(
  entryId: string,
  composition: EntryComposition,
): Promise<void> {
  const nutrients = compositionNutrients(composition);
  const db = await getDb();
  await db.runAsync(
    `UPDATE meal_entries SET components = ?, kcal = ?, protein = ?, carbs = ?,
       sugars = ?, fat = ?, saturated_fat = ?, fiber = ?, salt = ?,
       updated_at = ? WHERE id = ?`,
    [
      serializeComposition(composition),
      nutrients.kcal,
      nutrients.protein,
      nutrients.carbs,
      nutrients.sugars,
      nutrients.fat,
      nutrients.saturatedFat,
      nutrients.fiber,
      nutrients.salt,
      nowIso(),
      entryId,
    ],
  );
}

/**
 * Costruisce la composizione di una voce che non ne ha, dalla sua ricetta.
 *
 * Serve alle voci scritte prima della migrazione 10. Torna null quando non e'
 * possibile - la voce non viene da una ricetta, o la ricetta non esiste piu':
 * non e' un errore da mostrare, e' il limite di un dato che non c'e'.
 */
export async function materializeComposition(
  entryId: string,
): Promise<EntryComposition | null> {
  const existing = await getEntryComposition(entryId);
  if (existing) return existing;

  const db = await getDb();
  // `getEntry` non esiste in questo file: la riga si legge come fa gia'
  // `updateEntryQuantity`.
  const entry = await db.getFirstAsync<MealEntryRow>(
    "SELECT * FROM meal_entries WHERE id = ? AND deleted_at IS NULL",
    [entryId],
  );
  if (!entry?.recipe_id) return null;

  const tree = await buildRecipeTree(entry.recipe_id);
  if (!tree) return null;

  const composition: EntryComposition = {
    edited: false,
    items: flattenRecipe(tree, entry.servings ?? 1),
  };
  await saveEntryComposition(entryId, composition);
  return composition;
}
```

In `addRecipeEntry`, dopo `insertEntry`, scrivere la composizione:

```ts
  await saveEntryComposition(id, {
    edited: false,
    items: flattenRecipe(tree, args.servings),
  });
```

In `updateEntryQuantity`, il ramo `entry.recipe_id` diventa:

```ts
  } else if (entry.recipe_id) {
    const composition = parseComposition(entry.components);
    if (composition) {
      // La composizione della voce e' la verita': si riscala quella, senza
      // interrogare la ricetta - che potrebbe essere cambiata da allora.
      const previous = entry.servings || 1;
      const scaled = rescaleComposition(composition, quantity / previous);
      await saveEntryComposition(entryId, scaled);
      await db.runAsync(
        "UPDATE meal_entries SET servings = ?, updated_at = ? WHERE id = ?",
        [quantity, nowIso(), entryId],
      );
      return;
    }
    const tree = await buildRecipeTree(entry.recipe_id);
    if (!tree) throw new Error("Il pasto della riga non esiste più");
    nutrients = scaleNutrients(recipePerServing(tree), quantity * 100);
    servings = quantity;
  } else {
```

- [ ] **Passo 7: verificare**

Run: `npm run typecheck && npx jest src/db/queries/diary.test.ts src/db/migrations`
Atteso: verdi. Il test `backup.test.ts` "copre ogni tabella dello schema" deve
restare verde da solo: `meal_entries` è già in `BACKUP_TABLES` e una colonna
non cambia l'elenco.

- [ ] **Passo 8: commit**

```bash
git add src/db/migrations/010_entry_components.ts src/db/migrations/index.ts \
  src/db/queries/diary.ts src/db/queries/diary.test.ts src/types/nutrition.ts
git commit -m "feat(db): store a diary entry's composition"
```

---

### Task 4: il diario mostra gli ingredienti

**File:**
- Modifica: `src/containers/diary/EntryRow.tsx`
- Modifica: `src/i18n/locales/it.json`

**Interfacce:**
- Consuma: `parseComposition`, `componentNutrients` (Task 2); `entry.components` (Task 3)

- [ ] **Passo 1: aggiungere le chiavi**

In `src/i18n/locales/it.json`, dentro `diary`:

```json
    "edited": "modificata",
    "ingredients_show": "Vedi ingredienti",
```

- [ ] **Passo 2: l'elenco apribile**

In `EntryRow.tsx`: leggere `parseComposition(entry.components)`, e se ha almeno
un elemento mostrare una freccia (`ChevronDown` / `ChevronUp` da
`lucide-react-native`) che apre l'elenco. Chiuso di serie: un pasto con tre
ricette da sei ingredienti sarebbe un muro.

```tsx
  const composition = parseComposition(entry.components);
  const [open, setOpen] = useState(false);

  // ...dentro nameRow, accanto all'icona della stima:
  {composition?.edited ? (
    <Text style={[styles.edited, { color: colors.textFaint }]}>
      {t("diary.edited")}
    </Text>
  ) : null}

  // ...sotto la riga principale:
  {open && composition
    ? composition.items.map((item, index) => (
        <View key={`${item.label}-${index}`} style={styles.ingredient}>
          <Text style={[styles.ingredientName, { color: colors.textMuted }]}>
            {item.label}
          </Text>
          <Text style={[styles.ingredientQty, { color: colors.textFaint }]}>
            {`${Math.round(item.quantityG)} g · ${Math.round(componentNutrients(item).kcal)} kcal`}
          </Text>
        </View>
      ))
    : null}
```

Stili nuovi, con i token: `edited: { fontSize: 11 }`, `ingredient:
{ flexDirection: "row", justifyContent: "space-between", paddingLeft:
theme.spacing.md, paddingTop: 2 }`, `ingredientName: { fontSize: 12, flex: 1 }`,
`ingredientQty: { fontSize: 11 }`.

- [ ] **Passo 3: verificare**

Run: `npm run typecheck && npm run lint && npm test`
Atteso: verdi, zero errori di lint.

- [ ] **Passo 4: commit**

```bash
git add src/containers/diary/EntryRow.tsx src/i18n/locales/it.json
git commit -m "feat(app): show what a recipe entry was made of"
```

---

### Task 5: il foglio di modifica

**File:**
- Crea: `src/containers/diary/EntryCompositionSheet.tsx`
- Modifica: `src/navigation/screens/TodayScreen.tsx`
- Modifica: `src/i18n/locales/it.json`

**Interfacce:**
- Consuma: tutto Task 2, `getEntryComposition`/`saveEntryComposition`/
  `materializeComposition` (Task 3), `IngredientPicker` da
  `@/src/containers/recipes/IngredientPicker`
- Produce: `EntryCompositionSheet` con props
  `{ isOpen: boolean; entryId: string | null; title: string; onSaved: () => void; onClose: () => void }`

- [ ] **Passo 1: le chiavi**

Dentro `diary` in `it.json`:

```json
    "composition_title": "Modifica la composizione",
    "composition_add": "Aggiungi un ingrediente",
    "composition_empty": "Non è rimasto niente: togli la voce dal diario invece di svuotarla",
    "composition_save_recipe": "Salva come nuova ricetta",
```

- [ ] **Passo 2: il componente**

Un `DfAlert size="lg"` che al montaggio chiama `materializeComposition(entryId)`
e tiene la composizione in stato. Struttura:

- le porzioni in alto, sola lettura per ora (si cambiano dal
  `QuantityPrompt` come sempre);
- per ogni ingrediente: nome, campo grammi (`toGrams` da
  `@/src/domain/serving`), cestino che chiama `removeComponent`;
- un bottone che apre `IngredientPicker` e su scelta chiama `addComponent` con
  `{ foodId: food.id, label: food.name, quantityG: food.default_serving_g ?? 100, per100: foodNutrients(food) }`;
- il totale da `compositionNutrients`;
- Conferma chiama `saveEntryComposition` e poi `onSaved`.

Se `savableItems` è vuoto il bottone Conferma è disabilitato e compare
`composition_empty`: una voce senza ingredienti avrebbe zero calorie e un nome
che promette un pasto.

- [ ] **Passo 3: aprirlo da TodayScreen**

In `onEditEntry`, se la voce ha `source_kind === "recipe"` aprire
`EntryCompositionSheet` invece del `QuantityPrompt`. Le porzioni restano
raggiungibili da un'azione dentro il foglio.

- [ ] **Passo 4: verificare**

Run: `npm run typecheck && npm run lint && npm test`

- [ ] **Passo 5: commit**

```bash
git add src/containers/diary/EntryCompositionSheet.tsx \
  src/navigation/screens/TodayScreen.tsx src/i18n/locales/it.json
git commit -m "feat(app): edit what a logged recipe was made of"
```

---

### Task 6: creare un alimento senza uscire

**File:**
- Crea: `src/containers/diary/QuickFoodSheet.tsx`
- Modifica: `src/containers/diary/EntryCompositionSheet.tsx`
- Modifica: `src/i18n/locales/it.json`

**Interfacce:**
- Consuma: `createFood` da `@/src/db/queries/foods`
- Produce: `QuickFoodSheet` con props
  `{ isOpen: boolean; initialName: string; onCreated: (food: FoodRow) => void; onClose: () => void }`

- [ ] **Passo 1: le chiavi**

```json
    "quick_food_title": "Nuovo alimento",
    "quick_food_hint": "I valori sono per 100 g. Potrai completarlo da Alimenti.",
```

- [ ] **Passo 2: il foglio**

Nome più kcal, proteine, carboidrati e grassi per 100 g. Salva con
`createFood({ name, source: "user", nutrients })` e richiama `onCreated`.

È un form ridotto e non `FoodFormScreen` perché navigare a un'altra schermata
perderebbe la composizione in corso di modifica. Il form completo resta
raggiungibile da Alimenti.

- [ ] **Passo 3: attaccarlo al picker**

Quando la ricerca dentro `EntryCompositionSheet` non trova niente, una riga
"Crea «`termine`»" apre `QuickFoodSheet` col nome già scritto; alla creazione
l'alimento entra come ingrediente.

- [ ] **Passo 4: verificare e committare**

```bash
npm run typecheck && npm run lint && npm test
git add src/containers/diary/QuickFoodSheet.tsx \
  src/containers/diary/EntryCompositionSheet.tsx src/i18n/locales/it.json
git commit -m "feat(app): create a missing food without losing the edit"
```

---

### Task 7: salvare la variante come ricetta

**File:**
- Modifica: `src/containers/diary/EntryCompositionSheet.tsx`
- Modifica: `src/db/queries/recipes.ts`
- Test: `src/db/queries/recipes.test.ts`
- Modifica: `src/i18n/locales/it.json`

**Interfacce:**
- Produce: `createRecipeFromComposition(args: { name: string; servings: number; composition: EntryComposition }): Promise<string>`

- [ ] **Passo 1: il test che fallisce**

```ts
it("crea una ricetta dalla composizione di una voce", async () => {
  const salame = await createFood({
    name: "Salame",
    source: "user",
    nutrients: { ...EMPTY_NUTRIENTS, kcal: 400 },
  });

  const recipeId = await createRecipeFromComposition({
    name: "Crepes al salame",
    servings: 1,
    composition: {
      edited: true,
      items: [
        { foodId: salame, label: "Salame", quantityG: 40, per100: { ...EMPTY_NUTRIENTS, kcal: 400 } },
      ],
    },
  });

  const items = await getRecipeItems(recipeId);
  expect(items).toHaveLength(1);
  expect(items[0].quantity_g).toBeCloseTo(40);
});

// Un ingrediente creato a mano dentro la voce puo' non avere un alimento
// dietro: senza alimento non esiste una riga di ricetta, e va saltato invece
// di scrivere una riga che viola il CHECK della tabella.
it("salta gli ingredienti senza alimento", async () => {
  const recipeId = await createRecipeFromComposition({
    name: "Solo testo",
    servings: 1,
    composition: {
      edited: true,
      items: [
        { foodId: null, label: "Qualcosa", quantityG: 10, per100: EMPTY_NUTRIENTS },
      ],
    },
  });

  expect(await getRecipeItems(recipeId)).toHaveLength(0);
});
```

- [ ] **Passo 2: eseguire per vederlo fallire**

Run: `npx jest src/db/queries/recipes.test.ts`

- [ ] **Passo 3: implementare**

`createRecipeFromComposition` crea la ricetta con `createRecipe` e per ogni
elemento con `foodId` non nullo un item `{ foodId, quantityG }` - `RecipeItemInput`
non ha un campo `kind`.
`servings` è quello della voce, così i valori per porzione restano quelli
mangiati.

- [ ] **Passo 4: l'azione nel foglio**

Un bottone "Salva come nuova ricetta" che chiede il nome, proposto come
`${nome della voce} (variante)`. Alla conferma crea la ricetta e mostra un toast.

**Non ripunta la voce** alla ricetta nuova e non tocca l'originale: la voce di
oggi resta com'è, la ricetta nuova serve da domani. Ripuntarla riscriverebbe la
storia per guadagnare niente.

- [ ] **Passo 5: verificare e committare**

```bash
npm run typecheck && npm run lint && npm test
git add src/db/queries/recipes.ts src/db/queries/recipes.test.ts \
  src/containers/diary/EntryCompositionSheet.tsx src/i18n/locales/it.json
git commit -m "feat(app): keep a variant as a recipe of its own"
```

---

## Cosa resta fuori, di proposito

- Voci da alimento e voci libere non hanno composizione.
- Nessun raggruppamento delle sotto-ricette dentro la voce.
- Nessuna statistica per ingrediente: è il costo dichiarato della colonna JSON.
- La ricetta non impara dalle modifiche ripetute.
