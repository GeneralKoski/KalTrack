import fs from "fs";
import path from "path";

const SRC = path.join(__dirname, "..", "..");

/**
 * La regressione da cui nasce questo cancello: "`PhotoTile` e' l'unica
 * superficie fotografica che non passa da `SyncedPhoto`" era la premessa del
 * lavoro, e si e' rivelata falsa **tre volte** - `PhotoTile` e `PhotoField`
 * nello stesso file, e `ExerciseDetailScreen` attraverso `DfImage`, che per di
 * piu' ripiegava sull'icona dell'app: al posto della foto di dimostrazione di
 * un esercizio si vedeva l'icona di KalTrack.
 *
 * Nessuno dei tre si vedeva leggendo il codice, perche' l'`Image` di React
 * Native con un percorso dentro sembra giusta: quel che non fa e' chiedersi se
 * quel file sia su QUESTO telefono. La sincronizzazione porta le righe e non i
 * byte, quindi una foto scattata sull'altro dispositivo arriva qui come il
 * percorso di un file che qui non esiste - e senza `SyncedPhoto` non c'e' ne'
 * il download ne' il segnaposto, solo il vuoto.
 *
 * Le foto si disegnano con `SyncedPhoto`; per un'immagine che non e' una foto
 * dell'utente (un asset del bundle) c'e' `expo-image`, che e' anche quel che
 * `SyncedPhoto` usa dentro.
 */
describe("nessuna foto disegnata con l'Image di React Native", () => {
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

  /** `Image` fra le graffe di un import da "react-native", su piu' righe. */
  const importaImageDaRn = (text: string): boolean => {
    const blocchi = text.matchAll(/import\s*\{([^}]*)\}\s*from\s*"react-native"/g);
    for (const blocco of blocchi) {
      const nomi = blocco[1].split(",").map((nome) => nome.trim());
      if (nomi.some((nome) => /^(type\s+)?Image(\s+as\s+\w+)?$/.test(nome))) {
        return true;
      }
    }
    return false;
  };

  it("nessun file importa Image da react-native", () => {
    const colpevoli = sorgenti(SRC)
      .filter((file) => importaImageDaRn(fs.readFileSync(file, "utf8")))
      .map((file) => path.relative(SRC, file));

    expect(colpevoli).toEqual([]);
  });
});
