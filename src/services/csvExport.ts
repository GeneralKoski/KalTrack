import { getDb } from "@/src/db/index";
import { i18n } from "@/src/i18n";
import { logger } from "@/src/utils/logger";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

/**
 * Export CSV. Non è un backup e non serve a ripristinare: per quello c'è
 * backup.ts, che è fedele allo schema. Qui i dati sono denormalizzati e
 * leggibili, perché lo scopo è aprirli in un foglio di calcolo. Tenere separate
 * le due cose evita di degradare entrambe: un CSV leggibile non è ripristinabile
 * e un dump ripristinabile non è leggibile.
 */

/**
 * SCELTA DEI SEPARATORI: decimale VIRGOLA, campo PUNTO E VIRGOLA.
 *
 * Il file lo apre un utente italiano con Excel in locale italiano, dove il
 * separatore decimale è la virgola: "12.5" verrebbe letto come testo o come
 * data. Scelta la virgola per i decimali, il separatore di campo NON può essere
 * la virgola, altrimenti ogni numero decimale spaccherebbe la riga in due
 * colonne. Il punto e virgola è anche quello che Excel italiano si aspetta
 * aprendo un .csv con doppio clic.
 */
export const CSV_DELIMITER = ";";

/** RFC 4180: i record finiscono con CRLF. L'ultimo può farne a meno. */
const ROW_SEPARATOR = "\r\n";

/**
 * Senza BOM Excel su Windows legge il file come ANSI e "perché" diventa
 * "perchÃ©". Tre byte per non rovinare ogni accento del diario.
 */
export const UTF8_BOM = "\uFEFF";

/** Una cella: assente (null/undefined) è diverso da zero e da stringa vuota. */
export type CsvCell = string | number | null | undefined;

/** Virgola decimale, al massimo due decimali, senza zeri finali inutili. */
function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "";
  const rounded = Math.round(value * 100) / 100;
  // String(-0) è "0": Object.is evita di scrivere uno zero col segno.
  return String(Object.is(rounded, -0) ? 0 : rounded).replace(".", ",");
}

/**
 * Excel e LibreOffice valutano come FORMULA una cella che inizia con =, +, -,
 * @, TAB o CR: un alimento chiamato "=cmd|..." diventa esecuzione di codice
 * sulla macchina di chi apre il file (CSV injection). L'apostrofo iniziale
 * forza l'interpretazione a testo ed è invisibile nella cella.
 *
 * Vale solo per il testo: i numeri li formattiamo noi e un valore negativo
 * deve restare un numero, non diventare la stringa "'-2,5".
 */
const FORMULA_PREFIXES = ["=", "+", "-", "@", "\t", "\r"];

function neutralizeFormula(text: string): string {
  return FORMULA_PREFIXES.some((prefix) => text.startsWith(prefix))
    ? `'${text}`
    : text;
}

/**
 * Un campo pronto per il file: racchiuso tra virgolette quando contiene il
 * separatore, virgolette o un a capo, con le virgolette interne raddoppiate
 * (RFC 4180). Così una nota su più righe resta dentro il suo campo.
 */
export function csvEscape(value: CsvCell): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return formatNumber(value);

  const text = neutralizeFormula(value);
  const needsQuotes =
    text.includes(CSV_DELIMITER) ||
    text.includes('"') ||
    text.includes("\n") ||
    text.includes("\r") ||
    // Gli spazi ai bordi sopravvivono solo se il campo è racchiuso.
    text !== text.trim();

  return needsQuotes ? `"${text.replace(/"/g, '""')}"` : text;
}

export function buildCsv(headers: string[], rows: CsvCell[][]): string {
  return [headers, ...rows]
    .map((row) => row.map(csvEscape).join(CSV_DELIMITER))
    .join(ROW_SEPARATOR);
}

// ─── Insiemi di dati esportabili ─────────────────────────────────────────────

export const CSV_DATASETS = ["diary", "weight", "steps", "workouts"] as const;
export type CsvDataset = (typeof CSV_DATASETS)[number];

const yesNo = (flag: number): string => (flag === 1 ? "sì" : "no");

// ─── Diario ──────────────────────────────────────────────────────────────────

interface DiaryCsvRow {
  date: string;
  meal: string;
  item: string | null;
  source_kind: string;
  quantity_g: number | null;
  servings: number | null;
  kcal: number;
  protein: number;
  carbs: number;
  sugars: number;
  fat: number;
  saturated_fat: number;
  fiber: number;
  salt: number;
  is_estimated: number;
  note: string | null;
}

const DIARY_HEADERS = [
  "data",
  "pasto",
  "alimento",
  "quantità",
  "unità",
  "kcal",
  "proteine_g",
  "carboidrati_g",
  "zuccheri_g",
  "grassi_g",
  "grassi_saturi_g",
  "fibre_g",
  "sale_g",
  "stimato",
  "nota",
];

/**
 * Una riga per voce di diario, coi macro già congelati sulla riga: sono quelli
 * che l'utente ha effettivamente registrato, non un ricalcolo di oggi.
 *
 * La quantità di una ricetta e di una voce libera è in porzioni, quella di un
 * alimento in grammi: la colonna "unità" lo dice esplicitamente invece di
 * lasciare che il lettore sommi mele e pere.
 */
async function buildDiaryCsv(): Promise<string> {
  const db = await getDb();
  const rows = await db.getAllAsync<DiaryCsvRow>(
    `SELECT m.date AS date,
            mt.name AS meal,
            COALESCE(f.name, r.name, e.label) AS item,
            e.source_kind, e.quantity_g, e.servings,
            e.kcal, e.protein, e.carbs, e.sugars, e.fat,
            e.saturated_fat, e.fiber, e.salt,
            e.is_estimated, e.note
     FROM meal_entries e
     JOIN meals m ON m.id = e.meal_id
     JOIN meal_types mt ON mt.id = m.meal_type_id
     LEFT JOIN foods f ON f.id = e.food_id
     LEFT JOIN recipes r ON r.id = e.recipe_id
     WHERE e.deleted_at IS NULL AND m.deleted_at IS NULL
     ORDER BY m.date ASC, mt.sort ASC, e.sort ASC`,
  );

  return buildCsv(
    DIARY_HEADERS,
    rows.map((row) => {
      const isFood = row.source_kind === "food";
      return [
        row.date,
        row.meal,
        row.item,
        isFood ? row.quantity_g : (row.servings ?? row.quantity_g),
        isFood ? "g" : "porzioni",
        row.kcal,
        row.protein,
        row.carbs,
        row.sugars,
        row.fat,
        row.saturated_fat,
        row.fiber,
        row.salt,
        yesNo(row.is_estimated),
        row.note,
      ];
    }),
  );
}

// ─── Peso ────────────────────────────────────────────────────────────────────

interface WeightCsvRow {
  date: string;
  weight_kg: number;
  body_fat_pct: number | null;
  note: string | null;
}

async function buildWeightCsv(): Promise<string> {
  const db = await getDb();
  const rows = await db.getAllAsync<WeightCsvRow>(
    `SELECT date, weight_kg, body_fat_pct, note FROM weight_logs
     WHERE deleted_at IS NULL ORDER BY date ASC`,
  );

  return buildCsv(
    ["data", "peso_kg", "massa_grassa_pct", "nota"],
    // La massa grassa non misurata resta vuota: scriverci 0 la farebbe entrare
    // nei grafici come un crollo che non è mai avvenuto.
    rows.map((row) => [row.date, row.weight_kg, row.body_fat_pct, row.note]),
  );
}

// ─── Passi ───────────────────────────────────────────────────────────────────

interface StepsCsvRow {
  date: string;
  steps: number;
  source: string;
}

async function buildStepsCsv(): Promise<string> {
  const db = await getDb();
  const rows = await db.getAllAsync<StepsCsvRow>(
    `SELECT date, steps, source FROM step_logs
     WHERE deleted_at IS NULL ORDER BY date ASC`,
  );

  return buildCsv(
    ["data", "passi", "origine"],
    rows.map((row) => [row.date, row.steps, row.source]),
  );
}

// ─── Allenamenti ─────────────────────────────────────────────────────────────

interface WorkoutCsvRow {
  date: string;
  started_at: string | null;
  ended_at: string | null;
  session_notes: string | null;
  exercise: string | null;
  set_index: number;
  reps: number | null;
  weight: number | null;
  rpe: number | null;
  is_warmup: number;
}

const WORKOUT_HEADERS = [
  "data",
  "esercizio",
  "serie",
  "ripetizioni",
  "peso_kg",
  "rpe",
  "riscaldamento",
  "inizio",
  "fine",
  "nota_sessione",
];

/**
 * Una riga per serie. `set_index` è a base 0 nel database perché è un indice;
 * nel foglio diventa il numero della serie, che si conta da 1.
 */
async function buildWorkoutsCsv(): Promise<string> {
  const db = await getDb();
  const rows = await db.getAllAsync<WorkoutCsvRow>(
    `SELECT w.date AS date, w.started_at, w.ended_at, w.notes AS session_notes,
            x.name AS exercise,
            s.set_index, s.reps, s.weight, s.rpe, s.is_warmup
     FROM session_sets s
     JOIN workout_sessions w ON w.id = s.workout_session_id
     LEFT JOIN exercises x ON x.id = s.exercise_id
     WHERE s.deleted_at IS NULL AND w.deleted_at IS NULL
     ORDER BY w.date ASC, w.started_at ASC, s.set_index ASC`,
  );

  return buildCsv(
    WORKOUT_HEADERS,
    rows.map((row) => [
      row.date,
      row.exercise,
      row.set_index + 1,
      row.reps,
      row.weight,
      row.rpe,
      yesNo(row.is_warmup),
      row.started_at,
      row.ended_at,
      row.session_notes,
    ]),
  );
}

// ─── Composizione ────────────────────────────────────────────────────────────

const BUILDERS: Record<CsvDataset, () => Promise<string>> = {
  diary: buildDiaryCsv,
  weight: buildWeightCsv,
  steps: buildStepsCsv,
  workouts: buildWorkoutsCsv,
};

/** Il contenuto CSV di un insieme di dati, BOM escluso. */
export function buildDatasetCsv(dataset: CsvDataset): Promise<string> {
  return BUILDERS[dataset]();
}

/**
 * Tutti gli insiemi di dati in un file solo, uno sotto l'altro.
 *
 * Erano quattro pulsanti e quattro file, cioè quattro condivisioni da fare
 * per avere i propri dati: chi esporta li vuole tutti, non uno. Un CSV non ha
 * fogli, quindi le "pagine" sono blocchi separati da una riga vuota, ognuno
 * col suo titolo sopra le intestazioni - è così che un foglio di calcolo li
 * mostra distinti aprendo il file con un doppio clic.
 *
 * Il titolo passa da `csvEscape` come ogni altro campo: senza, un titolo con
 * un punto e virgola spaccherebbe la riga in due celle.
 */
export async function buildFullCsv(): Promise<string> {
  const sections = await Promise.all(
    CSV_DATASETS.map(async (dataset) => {
      const title = csvEscape(i18n.t(`backup.csv_${dataset}`));
      return `${title}${ROW_SEPARATOR}${await buildDatasetCsv(dataset)}`;
    }),
  );
  return sections.join(`${ROW_SEPARATOR}${ROW_SEPARATOR}`);
}

/**
 * La data nel nome del file è quella del CALENDARIO LOCALE, non UTC: un export
 * fatto alle 00:30 italiane porterebbe altrimenti la data di ieri.
 */
export function csvFileName(today = new Date()): string {
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  const date = `${today.getFullYear()}-${mm}-${dd}`;
  return `kaltrack-dati-${date}.csv`;
}

/** Scrive il CSV su file e ne ritorna il percorso. */
export async function exportCsvToFile(): Promise<string> {
  const content = await buildFullCsv();
  const path = `${FileSystem.documentDirectory}${csvFileName()}`;
  await FileSystem.writeAsStringAsync(path, `${UTF8_BOM}${content}`);
  logger.info("[csv] esportati tutti i dati");
  return path;
}

/**
 * Scrive il file e apre il foglio di condivisione del sistema.
 *
 * Se la condivisione non è disponibile lancia invece di uscire in silenzio:
 * chi ha toccato il pulsante deve vedere un esito, non un nulla di fatto.
 */
export async function shareCsv(): Promise<void> {
  const path = await exportCsvToFile();
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error("La condivisione non è disponibile su questo dispositivo");
  }
  await Sharing.shareAsync(path, {
    mimeType: "text/csv",
    UTI: "public.comma-separated-values-text",
    dialogTitle: "KalTrack CSV",
  });
}
