import { i18n } from "@/src/i18n";
import {
  decimalSeparator,
  formatDecimal,
  formatInteger,
} from "@/src/utils/number";
import fs from "fs";
import path from "path";

const SRC = path.join(__dirname, "..");

const originale = i18n.locale;
afterEach(() => {
  i18n.locale = originale;
});

describe("numeri nella lingua dell'app", () => {
  /*
    Cinque cifre e non quattro: in italiano il raggruppamento parte da cinque
    (`minimumGroupingDigits` vale 2), quindi 9400 si scrive "9400" e 94000 si
    scrive "94.000". In inglese parte da quattro. È esattamente la differenza
    che rende sbagliato scrivere un locale a mano: le due lingue non si
    distinguono solo per il segno, ma per quando lo mettono.
  */
  it("in italiano il punto separa le migliaia e la virgola i decimali", () => {
    i18n.locale = "it";
    expect(formatInteger(94000)).toBe("94.000");
    expect(formatDecimal(76.1, 1)).toBe("76,1");
    expect(decimalSeparator()).toBe(",");
  });

  it("in inglese è l'opposto", () => {
    // "9.400" letto in inglese è nove virgola quattro: un numero formattato
    // con le convenzioni di un'altra lingua non è brutto, è un altro numero.
    i18n.locale = "en";
    expect(formatInteger(94000)).toBe("94,000");
    expect(formatDecimal(76.1, 1)).toBe("76.1");
    expect(decimalSeparator()).toBe(".");
  });

  it("arrotonda gli interi invece di mostrarne i decimali", () => {
    i18n.locale = "it";
    expect(formatInteger(72726.6)).toBe("72.727");
  });

  it("i decimali sono un massimo, o un numero fisso di cifre con `fixed`", () => {
    i18n.locale = "it";
    expect(formatDecimal(76, 1)).toBe("76");
    expect(formatDecimal(76, 1, { fixed: true })).toBe("76,0");
  });
});

/**
 * La regressione da cui nasce `utils/number`: `toLocaleString("it-IT")` stava
 * scritto a mano in una ventina di posti, e nessuno se ne accorgeva finché non
 * apriva quella schermata nell'altra lingua - dove il titolo diceva "9.400
 * steps", che in inglese si legge nove virgola quattro.
 */
describe("nessun locale scritto a mano", () => {
  const sorgenti = (dir: string): string[] => {
    const out: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) out.push(...sorgenti(full));
      else if (/\.tsx?$/.test(entry.name) && !entry.name.includes(".test."))
        out.push(full);
    }
    return out;
  };

  /** I commenti nominano `toLocaleString("it-IT")` per spiegarlo: non contano. */
  const codice = (text: string): string =>
    text
      .split("\n")
      .filter((line) => !/^\s*(\/\/|\/\*|\*)/.test(line))
      .join("\n");

  it("nessun file passa un locale fisso a toLocaleString", () => {
    const colpevoli = sorgenti(SRC).filter((file) =>
      /toLocale(String|DateString|TimeString)\(\s*["']/.test(
        codice(fs.readFileSync(file, "utf8")),
      ),
    );
    expect(colpevoli.map((f) => path.relative(SRC, f))).toEqual([]);
  });
});
