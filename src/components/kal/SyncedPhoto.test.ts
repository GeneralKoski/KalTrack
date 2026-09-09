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

  /**
   * I commenti di questo repo spiegano il perche' delle cose, e qui dentro se
   * ne trovano diversi che NOMINANO l'`Image` di React Native per dire di non
   * usarla. Non sono codice e non contano - stessa regola del cancello sui
   * locali scritti a mano.
   */
  const codice = (text: string): string =>
    text
      .split("\n")
      .filter((line) => !/^\s*(\/\/|\/\*|\*)/.test(line))
      .join("\n");

  /**
   * `Image`, con o senza alias, fra i nomi di un elenco fra graffe.
   *
   * Due sintassi per l'alias e non una: un import rinomina con `as`, una
   * destrutturazione con i due punti. Con il solo `as`, `const { Image: Foto }
   * = require("react-native")` passava il cancello - provato.
   */
  const contieneImage = (graffe: string): boolean =>
    graffe
      .split(",")
      .map((nome) => nome.trim())
      .some((nome) => /^(type\s+)?Image(\s*(as|:)\s*\w+)?$/.test(nome));

  /**
   * Le vie per cui l'`Image` di React Native arriva in un file, e sono cinque
   * perche' un cancello con un buco che si conosce e' peggio di uno di cui si
   * ha fiducia: chi vede la suite verde dara' per scontato che nessun bypass
   * esista, ed e' l'assunzione che questo cancello esiste per rendere vera.
   *
   * La prima e' la forma che si scrive davvero e le altre quattro non le
   * scrive nessuno qui: sono coperte perche' la premessa di partenza - "e' una
   * superficie sola" - era falsa tre volte, e nessuno dei tre casi si vedeva
   * leggendo.
   *
   * Quel che resta fuori, dichiarato invece che dato per impossibile: una
   * chiave calcolata (`RN["Image"]`) e un namespace passato per un secondo
   * nome (`const alias = RN; alias.Image`). Sono forme che nessuno scrive per
   * caso, e coprirle vorrebbe dire leggere l'albero sintattico invece del
   * testo.
   */
  const vieVersoImage = (text: string): string[] => {
    const vie: string[] = [];

    // 1. Fra le graffe di un `import`, o di un `export ... from` che la
    //    riesporta con un altro nome.
    for (const blocco of text.matchAll(
      /(?:import|export)\s*\{([^}]*)\}\s*from\s*"react-native"/g,
    )) {
      if (contieneImage(blocco[1])) vie.push("graffe");
    }

    // 2. La stessa cosa destrutturata da un `require` o da una import
    //    dinamica.
    for (const blocco of text.matchAll(
      /(?:const|let|var)\s*\{([^}]*)\}\s*=\s*(?:require|await\s+import)\s*\(\s*"react-native"\s*\)/g,
    )) {
      if (contieneImage(blocco[1])) vie.push("destrutturazione");
    }

    // 3. Tutto il modulo dietro un nome: li' `Image` non compare
    //    nell'import, quindi si guarda l'USO (`RN.Image`). `\b` in coda
    //    perche' `RN.ImageBackground` e `RN.ImageStyle` non sono lei.
    const dietroUnNome = [
      ...text.matchAll(/import\s*\*\s*as\s+(\w+)\s*from\s*"react-native"/g),
      ...text.matchAll(
        /(?:const|let|var)\s*(\w+)\s*=\s*(?:require|await\s+import)\s*\(\s*"react-native"\s*\)/g,
      ),
    ];
    for (const blocco of dietroUnNome) {
      const nome = blocco[1];
      const usata =
        new RegExp(`\\b${nome}\\.Image\\b`).test(text) ||
        // ...oppure tirata giu' dal namespace in un secondo momento:
        // `const { Image } = RN`.
        [...text.matchAll(new RegExp(`\\{([^}]*)\\}\\s*=\\s*${nome}\\b`, "g"))]
          .some((estratti) => contieneImage(estratti[1]));
      if (usata) vie.push("namespace");
    }

    // 4. `export * from "react-native"` riesporta tutto, `Image` compresa, e
    //    non c'e' nessun uso da guardare in questo file.
    if (/export\s*\*\s*from\s*"react-native"/.test(text)) {
      vie.push("riesporta tutto");
    }

    // 5. Presa dal modulo senza passare da un nome:
    //    `require("react-native").Image`.
    if (
      /(?:require|import)\s*\(\s*"react-native"\s*\)\s*\)?\s*\.\s*Image\b/.test(
        text,
      )
    ) {
      vie.push("accesso diretto");
    }

    return vie;
  };

  it("nessun file raggiunge Image di react-native, per nessuna via", () => {
    const colpevoli = sorgenti(SRC).flatMap((file) =>
      vieVersoImage(codice(fs.readFileSync(file, "utf8"))).map(
        (via) => `${path.relative(SRC, file)} (${via})`,
      ),
    );

    expect(colpevoli).toEqual([]);
  });
});
