import { chat } from "@/src/ai/client";
import { MODELS } from "@/src/ai/config";
import { AiResponseError } from "@/src/ai/errors";
import { toCompressedDataUrl } from "@/src/ai/estimateFromPhoto";
import { kcalFromMacros, type Nutrients } from "@/src/domain/nutrition";
import { logger } from "@/src/utils/logger";

/**
 * Lettura della tabella nutrizionale stampata sulla confezione.
 *
 * ATTENZIONE, questo file è l'ECCEZIONE alla regola centrale del progetto.
 * Ovunque altrove il modello dice solo COSA e QUANTO, mai i valori nutrizionali
 * (spec §5.4): quelli vengono dal catalogo, perché un numero inventato non si
 * distingue da un numero vero. Qui il modello non inventa niente: trascrive
 * cifre che il produttore ha stampato sulla scatola ed è obbligato per legge a
 * dichiarare. È OCR, non stima.
 *
 * Perché la differenza tenga, tutto quel che segue deve restare vero:
 *  - i valori si mostrano SEMPRE all'utente prima di salvarli, in un form
 *    modificabile: nessuna scrittura silenziosa;
 *  - un campo non leggibile resta `null` e non diventa zero. "0 g di fibre" e
 *    "fibre non lette" sono cose diverse, e confonderle falsa i totali;
 *  - i valori che non reggono un controllo di coerenza vengono scartati, non
 *    corretti: un OCR sbagliato di nascosto è peggio di un campo vuoto.
 */

/** Le etichette hanno testo piccolo: qui il dettaglio serve, a differenza del piatto. */
const LABEL_MAX_SIDE_PX = 1568;

/** Ogni campo può mancare: sull'etichetta non tutti sono obbligatori. */
export interface LabelReading {
  /** Valori per 100 g o 100 ml, come li dichiara l'etichetta europea. */
  per100: Partial<Nutrients>;
  /**
   * Nome del prodotto se leggibile sulla confezione, per precompilare il campo.
   * Non è nella tabella nutrizionale: è il fronte della scatola.
   */
  productName: string | null;
  /** Grammi di una porzione, quando l'etichetta ne dichiara una. */
  servingG: number | null;
  /** Cosa non è stato possibile leggere, per dirlo all'utente invece di tacere. */
  missing: (keyof Nutrients)[];
}

const SYSTEM_PROMPT = `You read the nutrition facts table printed on European food packaging and return JSON.

Return exactly this shape:
{
  "productName": string or null,
  "servingG": number or null,
  "per100": {
    "kcal": number or null,
    "protein": number or null,
    "carbs": number or null,
    "sugars": number or null,
    "fat": number or null,
    "saturatedFat": number or null,
    "fiber": number or null,
    "salt": number or null
  }
}

Rules, in order of importance:
1. Transcribe only. Never estimate, infer, or complete a value you cannot read.
   A field you cannot read with certainty must be null, never 0 and never a guess.
2. Report the per-100-g (or per-100-ml) column. European labels often show a
   second column per portion or per piece: ignore it. If the label ONLY has a
   per-portion column, return every per100 field as null and set servingG.
3. Energy: report kcal, not kJ. Labels print both, usually as "560 kJ / 133 kcal".
   Taking the kJ number would inflate energy by roughly 4.2x.
4. Italian labels use a comma as the decimal separator: "1,5 g" is 1.5, not 15.
5. "carbs" is total carbohydrates ("Carboidrati"), "sugars" is the indented
   "di cui zuccheri" underneath it. Same for fat and "di cui acidi grassi saturi".
6. "salt" is salt in grams ("Sale"), not sodium. If only sodium is printed,
   return null for salt rather than converting it.
7. All values are grams except kcal. Never return negative numbers.
8. If the image is not a nutrition table at all, return every field as null.

Respond with JSON only.`;

const NUTRIENT_KEYS: (keyof Nutrients)[] = [
  "kcal",
  "protein",
  "carbs",
  "sugars",
  "fat",
  "saturatedFat",
  "fiber",
  "salt",
];

const readNumber = (value: unknown): number | null => {
  if (typeof value === "number") {
    return Number.isFinite(value) && value >= 0 ? value : null;
  }
  // Il modello a volte risponde "12,5" o "12.5 g" nonostante il prompt.
  if (typeof value === "string") {
    const cleaned = value.replace(",", ".").replace(/[^0-9.]/g, "");
    if (cleaned === "") return null;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  }
  return null;
};

/**
 * Quanto una lettura può discostarsi dalle kcal implicate dai macro prima di
 * essere considerata sbagliata. Le etichette vere sballano già di suo: i
 * produttori arrotondano, le fibre contribuiscono ~2 kcal/g e i polioli meno
 * dello zucchero. Sotto il 25% si accetta; un OCR che ha letto i kJ al posto
 * delle kcal sbaglia di 4,2 volte e cade fuori con ampio margine.
 */
const KCAL_TOLERANCE = 0.25;

/**
 * Scarta i valori che non possono stare insieme, invece di correggerli.
 *
 * Ogni regola qui è un errore di OCR realmente possibile, non un controllo di
 * principio: leggere i kJ come kcal, prendere la colonna per porzione da 30 g
 * come se fosse per 100 g, o scambiare la riga "di cui zuccheri" con quella dei
 * carboidrati totali.
 */
export const sanitizeReading = (
  per100: Partial<Nutrients>,
): Partial<Nutrients> => {
  const clean: Partial<Nutrients> = { ...per100 };

  // Nessun nutriente può superare i 100 g dentro 100 g di prodotto. L'olio è
  // il caso limite reale: 100 g di grassi su 100 g.
  for (const key of NUTRIENT_KEYS) {
    const value = clean[key];
    if (key !== "kcal" && value !== undefined && value > 100) {
      logger.warn(`[etichetta] ${key}=${value} per 100 g: scartato`);
      delete clean[key];
    }
  }

  // Nemmeno la somma dei macro può superare i 100 g.
  const macroSum =
    (clean.protein ?? 0) + (clean.carbs ?? 0) + (clean.fat ?? 0);
  if (macroSum > 100) {
    logger.warn(`[etichetta] macro totali ${macroSum} g per 100 g: scartati`);
    delete clean.protein;
    delete clean.carbs;
    delete clean.fat;
    delete clean.sugars;
    delete clean.saturatedFat;
  }

  // Le sottocategorie non possono superare la categoria che le contiene.
  if (
    clean.sugars !== undefined &&
    clean.carbs !== undefined &&
    clean.sugars > clean.carbs
  ) {
    logger.warn("[etichetta] zuccheri > carboidrati: zuccheri scartati");
    delete clean.sugars;
  }
  if (
    clean.saturatedFat !== undefined &&
    clean.fat !== undefined &&
    clean.saturatedFat > clean.fat
  ) {
    logger.warn("[etichetta] saturi > grassi: saturi scartati");
    delete clean.saturatedFat;
  }

  // Le kcal si controllano contro i macro solo quando ci sono tutti e tre:
  // con un macro mancante lo scarto non dice niente sull'energia.
  if (
    clean.kcal !== undefined &&
    clean.protein !== undefined &&
    clean.carbs !== undefined &&
    clean.fat !== undefined
  ) {
    const implied = kcalFromMacros(clean.protein, clean.carbs, clean.fat);
    const reference = Math.max(implied, clean.kcal);
    if (
      reference > 0 &&
      Math.abs(implied - clean.kcal) / reference > KCAL_TOLERANCE
    ) {
      logger.warn(
        `[etichetta] kcal ${clean.kcal} incoerenti con i macro (${Math.round(implied)}): scartate`,
      );
      delete clean.kcal;
    }
  }

  return clean;
};

const parseReading = (content: string | null): LabelReading => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content ?? "");
  } catch {
    throw new AiResponseError("L'etichetta non è stata letta correttamente");
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new AiResponseError("L'etichetta non è stata letta correttamente");
  }

  const root = parsed as Record<string, unknown>;
  const rawPer100 =
    typeof root.per100 === "object" && root.per100 !== null
      ? (root.per100 as Record<string, unknown>)
      : {};

  const per100: Partial<Nutrients> = {};
  for (const key of NUTRIENT_KEYS) {
    const value = readNumber(rawPer100[key]);
    if (value !== null) per100[key] = value;
  }

  const clean = sanitizeReading(per100);

  const name =
    typeof root.productName === "string" ? root.productName.trim() : "";

  return {
    per100: clean,
    productName: name === "" ? null : name,
    servingG: readNumber(root.servingG),
    missing: NUTRIENT_KEYS.filter((key) => clean[key] === undefined),
  };
};

/**
 * Legge la tabella nutrizionale da una foto della confezione.
 *
 * Non salva niente: restituisce quel che ha letto perché la schermata lo
 * mostri in un form modificabile. La decisione resta dell'utente, che ha la
 * scatola in mano e può correggere quello che la foto ha reso male.
 */
export async function readNutritionLabel(uri: string): Promise<LabelReading> {
  const dataUrl = await toCompressedDataUrl(uri, LABEL_MAX_SIDE_PX);

  const response = await chat({
    capability: "vision",
    model: MODELS.vision,
    responseFormatJson: true,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Trascrivi la tabella nutrizionale di questa confezione.",
          },
          { type: "image_url", image_url: { url: dataUrl } },
        ],
      },
    ],
  });

  return parseReading(response.content);
}

/** Quel che il form ha già dentro nel momento della scansione. */
export interface LabelFormState {
  name: string;
  defaultServingG: number | null;
}

/** I campi da scrivere nel form dopo una lettura. */
export interface LabelUpdates {
  nutrients: Partial<Nutrients>;
  name: string | null;
  defaultServingG: number | null;
  missing: (keyof Nutrients)[];
}

/**
 * Decide cosa scrivere nel form, senza toccarlo.
 *
 * Due regole, entrambe a favore di quel che c'è già:
 *  - un nutriente non letto non viene scritto, così un valore digitato a mano
 *    non finisce azzerato da una foto venuta male;
 *  - nome e porzione si scrivono solo su un campo vuoto: chi ha la scatola in
 *    mano sa il nome meglio dell'OCR, e lo ha appena battuto.
 */
export const labelUpdates = (
  reading: LabelReading,
  current: LabelFormState,
): LabelUpdates => ({
  nutrients: reading.per100,
  name:
    reading.productName !== null && current.name.trim() === ""
      ? reading.productName
      : null,
  defaultServingG:
    reading.servingG !== null && !current.defaultServingG
      ? reading.servingG
      : null,
  missing: reading.missing,
});
