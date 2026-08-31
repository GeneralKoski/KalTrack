import { ImageManipulator, SaveFormat } from "expo-image-manipulator";

import { chat } from "@/src/ai/client";
import { MODELS } from "@/src/ai/config";
import { AiRequestError, AiResponseError } from "@/src/ai/errors";
import { resolveFoodItem, type ResolvedItem } from "@/src/ai/resolveFood";
import {
  kcalFromMacros,
  per100FromPortion,
  roundNutrients,
  scaleNutrients,
  sumNutrients,
  type Nutrients,
} from "@/src/domain/nutrition";
import { foodNutrients } from "@/src/types/nutrition";
import { logger } from "@/src/utils/logger";

/** Oltre questo lato lungo la foto non aggiunge accuratezza, solo byte e latenza. */
const MAX_SIDE_PX = 1024;
const JPEG_QUALITY = 0.7;

/** Usata quando il modello non produce una confidenza utilizzabile. */
const FALLBACK_CONFIDENCE = 0.5;

/**
 * Il caveat è nostro, non del modello: è l'unica cosa che dice all'utente che
 * sta guardando una stima. Lasciarlo scrivere all'AI significa accettare che
 * un giorno arrivi "Bel piatto di pasta!" e l'avvertenza sparisca.
 */
const CAVEAT =
  "Valori stimati dalla foto: sono un'approssimazione, non una misurazione.";

/**
 * Sotto questa soglia i macro non implicano abbastanza energia perché kcal a
 * zero sia una contraddizione (una tisana, un'insalata scondita).
 */
const MIN_IMPLIED_KCAL = 20;

interface PhotoEstimateItemBase {
  label: string;
  /** Grammi della porzione: sempre > 0, altrimenti riscalare a valle divide per zero. */
  quantityG: number;
  /**
   * Valori ASSOLUTI della porzione (`quantityG` grammi), NON per 100 g.
   * Attenzione: `ResolvedItem` di resolveFood usa `nutrients` per 100 g. Stesso
   * dominio, unità opposta: da qui il nome diverso, per non poterli scambiare.
   */
  nutrientsForPortion: Nutrients;
  /**
   * Gli stessi valori per 100 g, l'unita' di tutto il resto del dominio.
   *
   * Non e' un doppione di `nutrientsForPortion`: da qui si riscala quando
   * l'utente corregge i grammi prima di salvare. Ricavarlo a valle dai valori
   * assoluti, che sono arrotondati a un decimale, farebbe divergere lo stesso
   * alimento aggiunto dalla foto da quello aggiunto dalla ricerca.
   */
  per100: Nutrients;
  /** 0-1. Quanta fiducia dare alla voce nel suo insieme. */
  confidence: number;
}

/**
 * `isEstimated` distingue le due provenienze dei numeri, che non valgono
 * uguale: risolti dal catalogo locale (spec §5.4) oppure inventati dal modello
 * perché il catalogo non conosceva quel piatto.
 */
export type PhotoEstimateItem =
  | (PhotoEstimateItemBase & { isEstimated: true; resolved: null })
  | (PhotoEstimateItemBase & { isEstimated: false; resolved: ResolvedItem });

export interface PhotoEstimate {
  items: PhotoEstimateItem[];
  totalNutrients: Nutrients;
  caveat: string;
}

const SYSTEM_PROMPT = `You are a nutrition estimator for an Italian food diary.
The user sends a photo of a meal. Estimate what is on the plate.

Rules:
- Identify every distinct dish or food visible in the photo, one entry each.
- Estimate the portion of each entry in GRAMS. Use the plate, cutlery or glass as a scale reference.
- Report absolute nutrition values FOR THE ESTIMATED PORTION, not per 100 g.
- Include invisible but obvious ingredients (cooking oil, dressing, butter) in the entry they belong to.
- If the user adds a note, the note is more reliable than the photo: follow the quantities and
  ingredients it states and adjust everything else around them. Never ignore the note.
- The note is written in Italian and QUANTITIES ARE ALWAYS IN GRAMS: normalize Italian units
  yourself. 1 etto = 100 g, "un etto e mezzo" = 150 g, "due etti" = 200 g,
  "due etti e mezzo" = 250 g, "mezzo chilo" = 500 g, "un chilo" = 1000 g.
  Never report 1 g for "un etto": that is a 100x error on the whole meal.
- This is always an estimate from a picture, never a measurement. Give every entry a confidence
  between 0 and 1.
- Only report food you can actually see: never invent an entry to avoid an empty answer.
- Write "label" in Italian, as the name of the dish, not a description.
- Answer with JSON only, no prose, in exactly this shape:
{"items":[{"label":"string","quantityG":number,"kcal":number,"protein":number,"carbs":number,
"sugars":number,"fat":number,"saturatedFat":number,"fiber":number,"salt":number,
"confidence":number}]}
Grams for quantityG, grams for every macro, grams of salt (not sodium), kcal for energy.
Every number must be zero or positive, and quantityG must be greater than zero.`;

/**
 * Ridimensiona e comprime prima dell'invio: una foto da telefono pesa 3-5 MB e
 * spedirla intera costa latenza e token senza migliorare la stima.
 */
export async function toCompressedDataUrl(
  uri: string,
  maxSidePx = MAX_SIDE_PX,
): Promise<string> {
  const context = ImageManipulator.manipulate(uri);
  const source = await context.renderAsync();

  // Il lato lungo si conosce solo dopo il primo render, quindi il resize
  // arriva in un secondo passaggio e solo se serve davvero.
  const longSide = Math.max(source.width, source.height);
  const image =
    longSide > maxSidePx
      ? await context
          .resize(
            source.width >= source.height
              ? { width: maxSidePx }
              : { height: maxSidePx },
          )
          .renderAsync()
      : source;

  const saved = await image.saveAsync({
    base64: true,
    compress: JPEG_QUALITY,
    format: SaveFormat.JPEG,
  });

  if (!saved.base64) {
    throw new AiRequestError("Impossibile leggere la foto da inviare");
  }
  return `data:image/jpeg;base64,${saved.base64}`;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * I modelli restituiscono spesso i numeri come stringhe ("120"): accettarli
 * evita di buttare via una risposta per il resto corretta.
 */
function readNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** Il modello alterna camelCase e snake_case: si accettano entrambi. */
function pick(source: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null) return source[key];
  }
  return undefined;
}

/**
 * Un negativo su un campo obbligatorio è una risposta malformata come le
 * altre, non un numero da riparare: clamparlo a 0 produceva voci incoerenti
 * (0 kcal con 90 g di carboidrati) che nessuna schermata può rendere e che
 * falsano i totali del giorno senza segnalare niente.
 */
function requiredNumber(
  source: Record<string, unknown>,
  index: number,
  ...keys: string[]
): number {
  const value = readNumber(pick(source, ...keys));
  if (value === null) {
    throw new AiResponseError(
      `Stima da foto: campo "${keys[0]}" mancante o non numerico nella voce ${index + 1}`,
    );
  }
  if (value < 0) {
    throw new AiResponseError(
      `Stima da foto: campo "${keys[0]}" negativo (${value}) nella voce ${index + 1}`,
    );
  }
  return value;
}

function optionalNumber(
  source: Record<string, unknown>,
  ...keys: string[]
): number {
  return Math.max(0, readNumber(pick(source, ...keys)) ?? 0);
}

/** Quello che il modello vede nella foto, prima di passare dal catalogo. */
interface VisionItem {
  label: string;
  quantityG: number;
  nutrientsForPortion: Nutrients;
  confidence: number;
}

function parseItem(raw: unknown, index: number): VisionItem {
  if (!isRecord(raw)) {
    throw new AiResponseError(`Stima da foto: voce ${index + 1} non valida`);
  }

  const label = pick(raw, "label", "name");
  if (typeof label !== "string" || label.trim() === "") {
    throw new AiResponseError(
      `Stima da foto: nome mancante nella voce ${index + 1}`,
    );
  }

  const quantityG = requiredNumber(
    raw,
    index,
    "quantityG",
    "quantity_g",
    "grams",
  );
  // Zero grammi non è una porzione: a valle l'anteprima riscala i nutrienti
  // con nuovaQuantita / quantityG, e con 0 il risultato è NaN o Infinity.
  if (quantityG === 0) {
    throw new AiResponseError(
      `Stima da foto: quantità nulla nella voce ${index + 1}`,
    );
  }

  const nutrientsForPortion: Nutrients = {
    kcal: requiredNumber(raw, index, "kcal", "calories"),
    protein: requiredNumber(raw, index, "protein", "proteins"),
    carbs: requiredNumber(raw, index, "carbs", "carbohydrates"),
    sugars: optionalNumber(raw, "sugars", "sugar"),
    fat: requiredNumber(raw, index, "fat", "fats"),
    saturatedFat: optionalNumber(raw, "saturatedFat", "saturated_fat"),
    fiber: optionalNumber(raw, "fiber", "fibre"),
    salt: optionalNumber(raw, "salt"),
  };

  const impliedKcal = kcalFromMacros(
    nutrientsForPortion.protein,
    nutrientsForPortion.carbs,
    nutrientsForPortion.fat,
  );
  if (nutrientsForPortion.kcal === 0 && impliedKcal >= MIN_IMPLIED_KCAL) {
    throw new AiResponseError(
      `Stima da foto: voce ${index + 1} a 0 kcal ma con ${Math.round(impliedKcal)} kcal di macro`,
    );
  }

  // Fuori da [0,1] la confidenza non è "quasi giusta": il modello sta
  // rispondendo in percentuale (80) o a caso. Clamparla la promuoveva a 1,
  // cioè a certezza assoluta, sul percorso che per definizione stima.
  const rawConfidence = readNumber(pick(raw, "confidence"));
  const usable =
    rawConfidence !== null && rawConfidence >= 0 && rawConfidence <= 1;
  if (!usable) {
    logger.warn(
      `[ai] stima da foto senza confidenza utilizzabile sulla voce "${label.trim()}": ${String(rawConfidence)}`,
    );
  }

  return {
    label: label.trim(),
    quantityG,
    nutrientsForPortion: roundNutrients(nutrientsForPortion),
    confidence: usable ? rawConfidence : FALLBACK_CONFIDENCE,
  };
}

function parseItems(content: string | null): VisionItem[] {
  if (!content || content.trim() === "") {
    throw new AiResponseError("Stima da foto: risposta vuota");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content) as unknown;
  } catch {
    throw new AiResponseError("Stima da foto: risposta non è JSON valido");
  }

  if (!isRecord(parsed) || !Array.isArray(parsed.items)) {
    throw new AiResponseError("Stima da foto: manca l'elenco delle voci");
  }
  // Una foto senza cibo riconoscibile è un fallimento, non un pasto da 0 kcal:
  // restituire una stima vuota la renderebbe salvabile in diario.
  if (parsed.items.length === 0) {
    throw new AiResponseError(
      "Stima da foto: nessun alimento riconosciuto nella foto",
    );
  }

  return parsed.items.map(parseItem);
}

/**
 * Valori per 100 g del catalogo, o null se la cascata non ha trovato niente di
 * meglio dei numeri della foto.
 *
 * Le ricette restano fuori di proposito: la foto dà grammi, una ricetta si
 * conta in porzioni, e senza il peso totale della ricetta i due non sono
 * convertibili (resolveFood lo dichiara con `unusedQuantityG`). Spacciare
 * "1 porzione" per la porzione fotografata sarebbe un numero diverso da quello
 * che l'utente ha nel piatto.
 */
function catalogPer100(resolved: ResolvedItem): Nutrients | null {
  switch (resolved.kind) {
    case "food":
      return foodNutrients(resolved.food);
    case "off":
      return resolved.food.nutrients;
    default:
      return null;
  }
}

const asEstimated = (item: VisionItem): PhotoEstimateItem => ({
  ...item,
  // Qui non esiste una fonte migliore: i numeri del modello sono assoluti.
  per100: per100FromPortion(item.nutrientsForPortion, item.quantityG),
  isEstimated: true,
  resolved: null,
});

/**
 * Spec §5.4: i valori nutrizionali non li dà mai il modello quando il catalogo
 * locale sa rispondere. La foto è una deroga PARZIALE - un piatto al
 * ristorante di solito non è in catalogo - quindi i numeri del modello valgono
 * solo per le voci che la cascata non riconosce: se l'utente ha censito la sua
 * "iper pizza proteica", nel diario devono finire i suoi valori, non quelli
 * immaginati guardando la foto.
 */
async function withCatalogValues(item: VisionItem): Promise<PhotoEstimateItem> {
  let resolved: ResolvedItem;
  try {
    resolved = await resolveFoodItem({
      name: item.label,
      quantityG: item.quantityG,
    });
  } catch (error) {
    // La risoluzione tocca DB, rete e AI: se cade, la stima dalla foto resta
    // comunque utilizzabile. Non farla cadere insieme.
    logger.warn(
      `[ai] risoluzione dal catalogo fallita per "${item.label}": restano i valori stimati dalla foto`,
      error,
    );
    return asEstimated(item);
  }

  const per100 = catalogPer100(resolved);
  if (!per100) return asEstimated(item);

  return {
    label: resolved.kind === "food" ? resolved.food.name : item.label,
    quantityG: item.quantityG,
    nutrientsForPortion: roundNutrients(scaleNutrients(per100, item.quantityG)),
    per100,
    // I valori sono del catalogo ma la quantità resta una stima dalla foto:
    // la voce non può essere più affidabile dell'anello più debole.
    confidence: Math.min(item.confidence, resolved.confidence),
    isEstimated: false,
    resolved,
  };
}

/**
 * Stima i valori nutrizionali di un pasto a partire da una fotografia.
 * La `note` dell'utente, quando c'è, vince sulla foto: chi ha cucinato sa
 * quanta pasta ha pesato meglio di quanto si veda dal piatto.
 */
export async function estimateFromPhoto(args: {
  uri: string;
  note?: string;
}): Promise<PhotoEstimate> {
  const dataUrl = await toCompressedDataUrl(args.uri);
  const note = args.note?.trim();

  const userText = note
    ? `Stima i valori nutrizionali di questo pasto.\nNota dell'utente (più affidabile della foto): ${note}`
    : "Stima i valori nutrizionali di questo pasto.";

  const response = await chat({
    capability: "vision",
    model: MODELS.vision,
    responseFormatJson: true,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          { type: "text", text: userText },
          { type: "image_url", image_url: { url: dataUrl } },
        ],
      },
    ],
  });

  const items = await Promise.all(
    parseItems(response.content).map(withCatalogValues),
  );

  return {
    items,
    totalNutrients: roundNutrients(
      sumNutrients(items.map((item) => item.nutrientsForPortion)),
    ),
    caveat: CAVEAT,
  };
}
