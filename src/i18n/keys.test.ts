// Non si chiama `it`: quel nome e' la funzione di jest, e l'import
// la coprirebbe rendendo impossibile scrivere un test in questo file.
import italian from "@/src/i18n/locales/it.json";
import { CSV_DATASETS } from "@/src/services/csvExport";
import { EQUIPMENT, MUSCLE_GROUPS, BLOCK_KINDS } from "@/src/types/gym";
import { REMINDER_KINDS } from "@/src/db/queries/reminders";
import { MEASUREMENT_SITES, PHOTO_POSES } from "@/src/types/wellbeing";
import fs from "fs";
import path from "path";

/**
 * Ogni `t("chiave")` deve trovare la sua stringa.
 *
 * Una chiave mancante non fa fallire niente: i18n-js restituisce la chiave
 * stessa, che finisce a schermo come "exit_app_title". Il difetto si vede solo
 * aprendo quella schermata, ed e' esattamente cio' che un test puo' impedire.
 *
 * Le chiavi costruite a runtime (`t(\`gym.muscle.${x}\`)`) restano fuori: qui
 * si controlla quel che e' statico, che e' la stragrande maggioranza.
 */

const SRC = path.join(__dirname, "..");

/** Le forme plurali (one/other) sono varianti della stessa chiave, non figlie. */
const PLURAL_FORMS = new Set(["zero", "one", "two", "few", "many", "other"]);

const flatten = (
  value: Record<string, unknown>,
  prefix = "",
): Set<string> => {
  const keys = new Set<string>();
  for (const [name, child] of Object.entries(value)) {
    const key = `${prefix}${name}`;
    if (typeof child === "object" && child !== null) {
      const nested = child as Record<string, unknown>;
      if (Object.keys(nested).every((k) => PLURAL_FORMS.has(k))) {
        keys.add(key);
      } else {
        for (const inner of flatten(nested, `${key}.`)) keys.add(inner);
      }
    } else {
      keys.add(key);
    }
  }
  return keys;
};

const sourceFiles = (dir: string): string[] => {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...sourceFiles(full));
    } else if (/\.tsx?$/.test(entry.name) && !entry.name.includes(".test.")) {
      out.push(full);
    }
  }
  return out;
};

describe("chiavi di traduzione", () => {
  const available = flatten(italian as Record<string, unknown>);

  it("ogni t(\"chiave\") statica esiste in it.json", () => {
    const missing = new Map<string, string[]>();

    for (const file of sourceFiles(SRC)) {
      const text = fs.readFileSync(file, "utf8");
      for (const line of text.split("\n")) {
        // I commenti contengono esempi come t("greeting"): non sono chiamate.
        const code = line.trim();
        if (code.startsWith("//") || code.startsWith("*")) continue;

        for (const match of code.matchAll(/\bt\(\s*"([a-zA-Z0-9_.]+)"/g)) {
          const key = match[1];
          if (available.has(key)) continue;
          const where = path.relative(SRC, file);
          missing.set(key, [...(missing.get(key) ?? []), where]);
        }
      }
    }

    expect(Object.fromEntries(missing)).toEqual({});
  });

  /**
   * Le chiavi costruite a runtime da un elenco chiuso: `t(\`gym.muscle.${x}\`)`
   * non e' verificabile leggendo il sorgente, ma l'elenco dei valori possibili
   * si': aggiungere un gruppo muscolare o un attrezzo senza la sua stringa
   * mostrerebbe la chiave grezza sotto ogni esercizio che lo usa.
   */
  it.each([
    ["gym.equipment", EQUIPMENT],
    ["gym.muscle", MUSCLE_GROUPS],
    ["gym.block", BLOCK_KINDS.map((kind) => kind)],
    ["reminders.weekdays", [0, 1, 2, 3, 4, 5, 6].map(String)],
    ["reminders.kinds", REMINDER_KINDS],
    ["measurements.sites", MEASUREMENT_SITES],
    ["progress_photos.poses", PHOTO_POSES],
    ["backup.csv", CSV_DATASETS.map((d) => d)],
  ])("ogni valore di %s ha la sua stringa", (prefix, values) => {
    const missing = (values as readonly string[]).filter((value) => {
      // I tipi di blocco usano il trattino basso, non il punto.
      const key =
        prefix === "gym.block"
          ? `gym.block_${value}`
          : prefix === "backup.csv"
            ? `backup.csv_${value}`
            : `${prefix}.${value}`;
      // I promemoria hanno un sotto-oggetto, non una stringa.
      if (prefix === "reminders.kinds") {
        return !available.has(`${key}.label`) || !available.has(`${key}.title`);
      }
      return !available.has(key);
    });
    expect(missing).toEqual([]);
  });
});
