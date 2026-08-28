import { chat } from "@/src/ai/client";
import { MODELS } from "@/src/ai/config";
import { AiResponseError } from "@/src/ai/errors";
import { getFoodByBarcode, searchFoods } from "@/src/db/queries/foods";
import { searchRecipes } from "@/src/db/queries/recipes";
import { EMPTY_NUTRIENTS, type Nutrients } from "@/src/domain/nutrition";
import { normalizeText } from "@/src/domain/text";
import { OpenFoodFactsError, searchByName } from "@/src/services/openFoodFacts";
import type { FoodInput, FoodRow, RecipeRow } from "@/src/types/nutrition";
import { logger } from "@/src/utils/logger";

export interface ResolveFoodInput {
  name: string;
  /** Grammi. Facoltativo: chi detta non dice sempre quanto. */
  quantityG?: number;
  /** Usato solo se il nome risolve in una ricetta, che si conta in porzioni. */
  servings?: number;
}

/**
 * Esito della risoluzione. I nutrienti non sono mai inclusi per ricette e
 * alimenti: quelli si leggono dalla riga (per 100 g) e li scala il chiamante,
 * così il diario resta l'unico posto che decide lo snapshot da congelare.
 */
export type ResolvedItem =
  | {
      kind: "recipe";
      recipe: RecipeRow;
      servings: number;
      confidence: number;
      /**
       * Grammi richiesti che la ricetta NON ha potuto usare: senza il peso
       * totale della ricetta non sono convertibili in porzioni. Dichiarati qui
       * invece che buttati, così il chiamante può chiedere conferma.
       */
      unusedQuantityG: number | null;
    }
  | {
      kind: "food";
      food: FoodRow;
      quantityG: number | null;
      confidence: number;
    }
  | {
      /**
       * Prodotto OpenFoodFacts NON ancora in libreria: risolvere non scrive
       * niente, salva chi conferma la voce. Scrivere qui creerebbe alimenti
       * anche per le voci che l'utente poi annulla.
       */
      kind: "off";
      food: FoodInput;
      quantityG: number | null;
      confidence: number;
    }
  | {
      kind: "estimated";
      label: string;
      /** Per 100 g, come per gli alimenti. */
      nutrients: Nutrients;
      quantityG: number | null;
      confidence: number;
    };

/** Input non utilizzabile: si rifiuta subito, prima di toccare DB, rete o AI. */
export class ResolveInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResolveInputError";
  }
}

/**
 * Sotto questa lunghezza la query è troppo corta perché un match parziale
 * significhi qualcosa: "te" sta dentro "tempeh" e "uova" è a un solo edit da
 * "uva". Con 2-3 caratteri si accetta solo il nome identico.
 */
const MIN_PARTIAL_QUERY_LEN = 4;

/**
 * La tolleranza fuzzy parte solo da qui ed è legata alla lunghezza della QUERY
 * (il candidato può essere lunghissimo e non c'entra niente).
 *
 * Otto caratteri, non cinque: in italiano un solo edit su parola breve produce
 * un alimento del tutto diverso, e sono coppie che esistono davvero nel seed:
 * pesce/pesca, uova/uva, mais/mars, pane/cane, tonno/sonno. Sotto questa
 * soglia si accetta solo l'esatto o la sottostringa. Un refuso su parola breve
 * è raro; agganciare il cibo sbagliato falsa il diario in silenzio.
 */
const MIN_FUZZY_QUERY_LEN = 8;

/** Rapporto massimo errori/lunghezza della query tollerato da un match fuzzy. */
const MAX_DISTANCE_RATIO = 0.25;

/** Fascia di punteggio del match per sottostringa. */
const SUBSTRING_BASE = 0.75;
const SUBSTRING_SPAN = 0.15;

/**
 * Quanto pesa la POSIZIONE del match rispetto al rapporto di lunghezza dentro
 * la fascia della sottostringa. Alto di proposito: "inizia con" è un segnale
 * di pertinenza molto più forte di "è corto".
 */
const POSITION_WEIGHT = 0.7;

/** Fascia di punteggio del match fuzzy: sempre sotto la sottostringa. */
const FUZZY_BASE = 0.6;
const FUZZY_SPAN = 0.14;

/**
 * Tetto di sicurezza sui candidati caricati, non un criterio di selezione: il
 * punteggio si calcola su TUTTA la libreria. Un LIMIT più stretto taglierebbe
 * i candidati per preferiti/utilizzi, criteri che non hanno niente a che
 * vedere con la somiglianza, e il match esatto potrebbe non essere valutato.
 */
const CANDIDATE_LIMIT = 5_000;

const OFF_LIMIT = 10;

/**
 * I dati OpenFoodFacts sono inseriti dagli utenti e spesso approssimativi:
 * a parità di somiglianza valgono meno di un alimento della libreria locale.
 */
const OFF_TRUST_FACTOR = 0.9;

/** Oltre 10 kg in una voce di diario non è una quantità, è un errore di parsing. */
const MAX_QUANTITY_G = 10_000;

/** 100 g di grasso puro sono ~900 kcal: oltre, il modello ha inventato. */
const MAX_KCAL_PER_100G = 900;

const round2 = (value: number): number => Math.round(value * 100) / 100;

/**
 * Distanza di Levenshtein su due righe, senza matrice completa: le stringhe
 * qui sono nomi di alimenti, ma la libreria può essere scandita per intero.
 */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current: number[] = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + cost,
      );
    }
    previous = current;
  }
  return previous[b.length];
}

/**
 * Somiglianza fra due nomi, o null se non si somigliano abbastanza.
 *
 * Le tre fasce non si sovrappongono di proposito: un match esatto (1) batte
 * sempre una sottostringa (0.75-0.90), che batte sempre un match a distanza di
 * edit (0.60-0.74). Così la confidenza dice anche *come* si è arrivati al
 * risultato, e i livelli della cascata sono confrontabili fra loro.
 *
 * Qui sta l'unica soglia di accettazione: null significa "non abbastanza
 * simile". Un secondo filtro a valle sarebbe una soglia morta che nasconde la
 * regola vera (era il caso di MIN_CONFIDENCE 0.55, che non scartava nulla).
 */
/** Neutralizza i caratteri speciali di un nome usato dentro una RegExp. */
const escapeForRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function matchScore(query: string, candidate: string): number | null {
  const q = normalizeText(query);
  const c = normalizeText(candidate);
  if (q === "" || c === "") return null;

  if (q === c) return 1;

  // Da qui in giù si tratta di match parziali: su query cortissime sono rumore.
  if (q.length < MIN_PARTIAL_QUERY_LEN) return null;

  if (c.includes(q) || q.includes(c)) {
    // Il solo rapporto di lunghezza premia il candidato più corto, che è il
    // criterio sbagliato: per "uovo" faceva vincere "Albume d'uovo" su "Uovo
    // di gallina intero". Conta anche DOVE cade il match: un candidato che
    // inizia con la query, o in cui la query è una parola intera, è più
    // pertinente di uno che se la porta in coda.
    const ratio = Math.min(q.length, c.length) / Math.max(q.length, c.length);
    const startsWith = c.startsWith(q) || q.startsWith(c);
    const wholeWord = new RegExp(`(^|\\s)${escapeForRegExp(q)}($|\\s)`).test(c);

    const position = startsWith ? 1 : wholeWord ? 0.6 : 0;
    const score =
      SUBSTRING_BASE +
      SUBSTRING_SPAN * (POSITION_WEIGHT * position + (1 - POSITION_WEIGHT) * ratio);
    return round2(score);
  }

  if (q.length < MIN_FUZZY_QUERY_LEN) return null;
  // Un refuso capita in mezzo alla parola; alimenti diversi si distinguono
  // spesso proprio dalla prima lettera (tonno/sonno, pane/cane).
  if (q[0] !== c[0]) return null;

  const threshold = Math.floor(q.length * MAX_DISTANCE_RATIO);
  const distance = editDistance(q, c);
  if (distance > threshold) return null;
  // +1 al denominatore: il caso peggiore resta dentro la fascia fuzzy invece di
  // finire esattamente sulla soglia di accettazione.
  return round2(FUZZY_BASE + FUZZY_SPAN * (1 - distance / (threshold + 1)));
}

interface Match<T> {
  item: T;
  confidence: number;
}

function bestMatch<T>(
  query: string,
  items: T[],
  nameOf: (item: T) => string,
): Match<T> | null {
  let best: Match<T> | null = null;
  for (const item of items) {
    const confidence = matchScore(query, nameOf(item));
    if (confidence === null) continue;
    if (!best || confidence > best.confidence) best = { item, confidence };
  }
  return best;
}

/**
 * Priorità a parità di punteggio: prima le ricette, poi gli alimenti
 * dell'utente, poi il seed. È uno SPAREGGIO, non una precedenza: un match
 * esatto su un alimento deve battere una sottostringa su una ricetta.
 */
const TIER = { recipe: 0, userFood: 1, seedFood: 2 } as const;

type LocalMatch =
  | { kind: "recipe"; recipe: RecipeRow; confidence: number; tier: number }
  | { kind: "food"; food: FoodRow; confidence: number; tier: number };

const better = (a: LocalMatch, b: LocalMatch): boolean =>
  a.confidence > b.confidence ||
  (a.confidence === b.confidence && a.tier < b.tier);

async function loadCandidates<T>(
  load: (limit: number) => Promise<T[]>,
  what: string,
): Promise<T[]> {
  const rows = await load(CANDIDATE_LIMIT);
  if (rows.length >= CANDIDATE_LIMIT) {
    logger.warn(
      `[resolveFood] ${what}: raggiunto il tetto di ${CANDIDATE_LIMIT} candidati, il match migliore potrebbe restare fuori`,
    );
  }
  return rows;
}

/**
 * Valuta insieme tutti i livelli locali (ricette, alimenti dell'utente, seed) e
 * restituisce il punteggio più alto.
 *
 * Non si ferma al primo livello che risponde: fermarsi significherebbe far
 * vincere una ricetta somigliante a metà su un alimento con lo stesso nome
 * esatto ("riso" -> "Insalata di riso" invece di "Riso").
 */
async function bestLocalMatch(name: string): Promise<LocalMatch | null> {
  const [recipes, foods] = await Promise.all([
    loadCandidates((limit) => searchRecipes("", limit), "ricette"),
    loadCandidates((limit) => searchFoods("", limit), "alimenti"),
  ]);

  const candidates: LocalMatch[] = [];
  for (const recipe of recipes) {
    const confidence = matchScore(name, recipe.name);
    if (confidence !== null) {
      candidates.push({
        kind: "recipe",
        recipe,
        confidence,
        tier: TIER.recipe,
      });
    }
  }
  for (const food of foods) {
    const confidence = matchScore(name, food.name);
    if (confidence !== null) {
      candidates.push({
        kind: "food",
        food,
        confidence,
        tier: food.source === "seed" ? TIER.seedFood : TIER.userFood,
      });
    }
  }

  let best: LocalMatch | null = null;
  for (const candidate of candidates) {
    if (!best || better(candidate, best)) best = candidate;
  }
  return best;
}

type OffMatch =
  | { kind: "food"; food: FoodRow; confidence: number }
  | { kind: "off"; food: FoodInput; confidence: number };

async function matchOpenFoodFacts(name: string): Promise<OffMatch | null> {
  let products: FoodInput[];
  try {
    products = await searchByName(name, OFF_LIMIT);
  } catch (error) {
    // Solo l'indisponibilità di OFF è un degrado accettabile: un TypeError o un
    // bug di parsing deve emergere, non travestirsi da "rete assente".
    if (!(error instanceof OpenFoodFactsError)) throw error;
    logger.warn("[resolveFood] OpenFoodFacts non disponibile", error);
    return null;
  }

  const found = bestMatch(name, products, (product) => product.name);
  if (!found) return null;
  const confidence = round2(found.confidence * OFF_TRUST_FACTOR);

  // Dedup sul barcode: il prodotto può essere già in libreria con un altro
  // nome, e lo schema non ha un vincolo UNIQUE che lo impedisca.
  const barcode = found.item.barcode;
  if (barcode !== undefined && barcode !== null && barcode !== "") {
    const existing = await getFoodByBarcode(barcode);
    if (existing) return { kind: "food", food: existing, confidence };
  }
  return { kind: "off", food: found.item, confidence };
}

/**
 * Inglese di proposito: i modelli seguono le istruzioni in inglese meglio che
 * in italiano. Il contenuto richiesto resta italiano.
 */
const ESTIMATE_SYSTEM_PROMPT = `You are a nutrition reference for Italian food.
Given the name of a food, return its nutrition facts PER 100 GRAMS of edible product.
Use typical Italian values (supermarket products or home cooking).
Reply with a single JSON object and nothing else, with exactly these keys:
"label": string, the food name in Italian, cleaned up;
"kcal": number, kilocalories per 100 g;
"protein", "carbs", "sugars", "fat", "saturatedFat", "fiber", "salt": numbers, grams per 100 g;
"confidence": number between 0 and 1, how sure you are of these values.
Never return null or a string for a numeric field: use 0 when a value is unknown.
English words mixed into Italian food names are normal (whey, overnight oats): keep them.`;

/**
 * I modelli mandano spesso i numeri come stringa ("165"): si accettano come
 * fa toNumber di openFoodFacts, altrimenti lo stesso dato è valido da OFF e
 * fa fallire tutta la stima quando arriva dall'AI.
 */
function numberOf(value: unknown): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function parseEstimate(
  content: string | null,
  fallbackLabel: string,
): { label: string; nutrients: Nutrients; confidence: number } {
  if (!content) throw new AiResponseError("Stima nutrizionale vuota");

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new AiResponseError("Stima nutrizionale non è JSON valido");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new AiResponseError("Stima nutrizionale in formato inatteso");
  }

  const record = parsed as Record<string, unknown>;
  const kcal = numberOf(record["kcal"]);
  if (kcal <= 0) throw new AiResponseError("Stima nutrizionale senza kcal");
  if (kcal > MAX_KCAL_PER_100G) {
    throw new AiResponseError(`Stima nutrizionale implausibile: ${kcal} kcal`);
  }

  const label = record["label"];
  const confidence = record["confidence"];

  return {
    label:
      typeof label === "string" && label.trim() !== ""
        ? label.trim()
        : fallbackLabel,
    nutrients: {
      ...EMPTY_NUTRIENTS,
      kcal,
      protein: numberOf(record["protein"]),
      carbs: numberOf(record["carbs"]),
      sugars: numberOf(record["sugars"]),
      fat: numberOf(record["fat"]),
      saturatedFat: numberOf(record["saturatedFat"]),
      fiber: numberOf(record["fiber"]),
      salt: numberOf(record["salt"]),
    },
    confidence:
      typeof confidence === "number" && Number.isFinite(confidence)
        ? round2(Math.min(Math.max(confidence, 0), 1))
        : 0.4,
  };
}

async function estimateWithAi(
  name: string,
  quantityG: number | null,
): Promise<ResolvedItem> {
  const response = await chat({
    capability: "food_estimate",
    model: MODELS.assistant,
    responseFormatJson: true,
    messages: [
      { role: "system", content: ESTIMATE_SYSTEM_PROMPT },
      { role: "user", content: `Alimento: "${name}". Valori per 100 g.` },
    ],
  });

  const estimate = parseEstimate(response.content, name);
  return {
    kind: "estimated",
    label: estimate.label,
    nutrients: estimate.nutrients,
    quantityG,
    confidence: estimate.confidence,
  };
}

/**
 * Grammi validati al confine del modulo: a valle scaleNutrients scarta solo
 * `grams <= 0`, che NaN non attiva, e i macro finirebbero NaN nel diario.
 */
function checkedQuantity(value: number | undefined): number | null {
  if (value === undefined) return null;
  if (!Number.isFinite(value) || value <= 0) {
    throw new ResolveInputError(`Quantità in grammi non valida: ${value}`);
  }
  if (value > MAX_QUANTITY_G) {
    throw new ResolveInputError(`Quantità in grammi implausibile: ${value}`);
  }
  return value;
}

function checkedServings(value: number | undefined): number | null {
  if (value === undefined) return null;
  if (!Number.isFinite(value) || value <= 0) {
    throw new ResolveInputError(`Numero di porzioni non valido: ${value}`);
  }
  return value;
}

/**
 * Cascata di risoluzione: livelli locali (ricette, alimenti dell'utente, seed),
 * poi OpenFoodFacts, poi la stima AI.
 *
 * I livelli locali vengono valutati TUTTI e vince il punteggio più alto; si
 * scende di livello solo se nessuno di loro ha risposto. La stima AI è
 * l'ultima risorsa e non deve mai essere chiamata quando esiste un match
 * locale: costa, richiede rete e produce numeri inventati al posto di quelli
 * che l'utente ha già censito.
 */
export async function resolveFoodItem(
  input: ResolveFoodInput,
): Promise<ResolvedItem> {
  const name = input.name.trim();
  if (name === "") throw new ResolveInputError("Nome dell'alimento mancante");
  const quantityG = checkedQuantity(input.quantityG);
  const servings = checkedServings(input.servings);

  const local = await bestLocalMatch(name);
  if (local?.kind === "recipe") {
    return {
      kind: "recipe",
      recipe: local.recipe,
      servings: servings ?? 1,
      confidence: local.confidence,
      unusedQuantityG: quantityG,
    };
  }
  if (local) {
    return {
      kind: "food",
      food: local.food,
      quantityG,
      confidence: local.confidence,
    };
  }

  const off = await matchOpenFoodFacts(name);
  if (off) {
    return off.kind === "food"
      ? { kind: "food", food: off.food, quantityG, confidence: off.confidence }
      : { kind: "off", food: off.food, quantityG, confidence: off.confidence };
  }

  return estimateWithAi(name, quantityG);
}

/**
 * Risolve una lista di voci dettate mantenendo l'ordine di dettatura: è la
 * forma in cui arrivano dall'assistente ("pollo, riso e insalata").
 */
export function resolveFoodItems(
  items: ResolveFoodInput[],
): Promise<ResolvedItem[]> {
  return Promise.all(items.map((item) => resolveFoodItem(item)));
}
