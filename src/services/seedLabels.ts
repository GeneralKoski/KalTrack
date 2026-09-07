import { getDb } from "@/src/db";
import { MEAL_TYPE_IDS } from "@/src/db/migrations";
import { nowIso } from "@/src/db/ids";
import { i18n } from "@/src/i18n";
import { logger } from "@/src/utils/logger";

/**
 * I nomi che il seed scrive nel database, tradotti nella lingua dell'app.
 *
 * **Il problema che risolve.** I tipi di pasto nascono da una migrazione SQL e
 * il promemoria dell'acqua da `ensureDefaultReminder`: sono RIGHE, non testo
 * dell'interfaccia, e nessuna traduzione le raggiunge. Chi usava KalTrack in
 * inglese leggeva "CENA" come intestazione del diario e "Bevi un bicchiere
 * d'acqua" fra i promemoria.
 *
 * **Perche' si riscrive la riga invece di tradurre a schermo.** Quei nomi non
 * li legge solo il diario: li manda il catalogo all'assistente, li scrive il
 * CSV, li mostrano il piano e il foglio Aggiungi. Tradurre al momento del
 * disegno vorrebbe dire ricordarsene in ognuno di quei posti, per sempre;
 * riscrivere la riga li sistema tutti insieme, una volta.
 *
 * **La regola che non si rompe** (`CLAUDE.md` § I pasti che si possono usare):
 * si riscrive SOLO una riga che porta ancora un nome del seed, in una qualunque
 * delle lingue supportate. Un pasto rinominato a mano - "Pre-nanna", "Post
 * workout" - non si tocca, e nemmeno uno creato dall'utente. Cambiare lingua
 * non e' un'occasione per riscrivere quel che uno ha scritto.
 */

/**
 * Le lingue le dichiara questo modulo, e NON le importa da
 * `translationStore`: quello store chiama `relabelSeededRows` al cambio
 * lingua, e importarlo di rimando creava un ciclo - proprio il caso che
 * `CLAUDE.md` segna come sorgente di valori non inizializzati. Qui basta
 * sapere per quali lingue esiste un nome, e lo dicono le chiavi di `SeedNames`.
 */
const LANGUAGES = ["it", "en"] as const;

type SeedLanguage = (typeof LANGUAGES)[number];

type SeedNames = Record<SeedLanguage, string>;

/**
 * I cinque pasti predefiniti. Il minuscolo c'e' perche' la migrazione 2 li
 * scriveva cosi' e la 11 li ha capitalizzati: un database mai aggiornato in
 * mezzo puo' portare ancora la forma vecchia.
 */
const MEAL_TYPES: { id: string; names: SeedNames; legacy: string[] }[] = [
  {
    id: MEAL_TYPE_IDS.breakfast,
    names: { it: "Colazione", en: "Breakfast" },
    legacy: ["colazione"],
  },
  {
    id: MEAL_TYPE_IDS.brunch,
    names: { it: "Brunch", en: "Brunch" },
    legacy: ["brunch"],
  },
  {
    id: MEAL_TYPE_IDS.lunch,
    names: { it: "Pranzo", en: "Lunch" },
    legacy: ["pranzo"],
  },
  {
    id: MEAL_TYPE_IDS.snack,
    names: { it: "Snack", en: "Snack" },
    legacy: ["snack"],
  },
  {
    id: MEAL_TYPE_IDS.dinner,
    names: { it: "Cena", en: "Dinner" },
    legacy: ["cena"],
  },
];

/** Il promemoria che `ensureDefaultReminder` crea su un database vuoto. */
const WATER_REMINDER: SeedNames = {
  it: "Bevi un bicchiere d'acqua",
  en: "Drink a glass of water",
};

const language = (): SeedLanguage => {
  const code = i18n.locale.split("-")[0];
  return (LANGUAGES as readonly string[]).includes(code)
    ? (code as SeedLanguage)
    : "en";
};

/** Tutti i nomi con cui quella riga puo' essere stata seminata. */
const seeded = (names: SeedNames, legacy: string[] = []): string[] => [
  ...LANGUAGES.map((lang) => names[lang]),
  ...legacy,
];

/** Il nome del promemoria dell'acqua nella lingua corrente. */
export const defaultWaterReminderLabel = (): string =>
  WATER_REMINDER[language()];

/**
 * Riporta i nomi seminati nella lingua dell'app.
 *
 * Si chiama all'avvio e a ogni cambio lingua. Non lancia: un nome nella lingua
 * sbagliata e' un difetto di forma, e non vale bloccare l'avvio dell'app.
 */
export async function relabelSeededRows(): Promise<void> {
  try {
    const db = await getDb();
    const lang = language();
    const now = nowIso();

    for (const type of MEAL_TYPES) {
      const wanted = type.names[lang];
      const known = seeded(type.names, type.legacy);
      await db.runAsync(
        `UPDATE meal_types SET name = ?, updated_at = ?
          WHERE id = ? AND name <> ?
            AND name IN (${known.map(() => "?").join(", ")})`,
        [wanted, now, type.id, wanted, ...known],
      );
    }

    const wantedReminder = WATER_REMINDER[lang];
    const knownReminders = seeded(WATER_REMINDER);
    await db.runAsync(
      `UPDATE reminders SET label = ?, updated_at = ?
        WHERE kind = 'water' AND label <> ?
          AND label IN (${knownReminders.map(() => "?").join(", ")})`,
      [wantedReminder, now, wantedReminder, ...knownReminders],
    );
  } catch (error) {
    logger.warn("[i18n] rietichettatura delle righe seminate fallita", error);
  }
}
