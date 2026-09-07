import {
  formatNumber,
  numberToDisplay,
  parseToNumber,
} from "@/src/components/form/numberFormat";

/**
 * Il valore che DfNumberInput mette nel form non è il testo che l'utente vede.
 * Questi test fissano quel contratto: chi legge il form deve fare solo
 * `Number(...)`, mai una seconda conversione dal formato italiano.
 */
describe("valore consegnato al form", () => {
  it("converte la virgola in punto decimale", () => {
    expect(parseToNumber("3,2")).toBe("3.2");
  });

  it("regge un numero di quattro cifre con i decimali", () => {
    expect(parseToNumber("1234,5")).toBe("1234.5");
  });

  it("lascia intatto un intero", () => {
    expect(parseToNumber("553")).toBe("553");
  });

  it("restituisce stringa vuota per un campo vuoto", () => {
    expect(parseToNumber("")).toBe("");
  });

  /**
   * Il difetto che questo test blocca: FoodFormScreen e NutrientFields
   * applicavano di nuovo la normalizzazione italiana al valore già
   * normalizzato. "3,2" g di proteine finivano a database come 32 g, mentre il
   * campo continuava a mostrare "3,2".
   */
  it("una seconda normalizzazione italiana rovinerebbe il valore", () => {
    const inForm = parseToNumber("3,2");
    const rinormalizzato = Number(inForm.replace(/\./g, "").replace(",", "."));
    expect(rinormalizzato).toBe(32);
    expect(Number(inForm)).toBe(3.2);
  });
});

describe("valore mostrato a schermo", () => {
  it("riporta in formato italiano quel che c'e' nel form", () => {
    expect(numberToDisplay("3.2", 1)).toBe("3,2");
    expect(numberToDisplay(1234.5, 1)).toBe("1234,5");
  });

  /** Il giro completo non deve cambiare il numero. */
  it("regge il giro form -> schermo -> form", () => {
    const inForm = parseToNumber("1234,5");
    expect(Number(inForm)).toBe(1234.5);
    expect(parseToNumber(numberToDisplay(inForm, 1))).toBe(inForm);
  });
});

/**
 * Il campo e' controllato: quel che torna da qui e' il testo che RN riscrive
 * nel campo nativo. `digita` fa esattamente il giro di DfNumberInput - testo
 * digitato, valore nel form, testo a schermo - un carattere alla volta, che e'
 * il solo modo di vedere questi difetti: sul valore finale non si vedono.
 */
const digita = (sequenza: string, decimals: number): string => {
  let aSchermo = "";
  for (const carattere of sequenza) {
    const nelForm = parseToNumber(formatNumber(aSchermo + carattere, decimals));
    aSchermo = numberToDisplay(nelForm, decimals);
  }
  return aSchermo;
};

describe("un separatore aggiunto da noi torna indietro come decimale", () => {
  /**
   * Il difetto che questi test bloccano: il campo scriveva da se' il punto
   * delle migliaia ("1.000"), e al tasto dopo lo rileggeva come separatore
   * decimale, perche' la virgola non c'era. La quinta cifra di 10005 mandava il
   * campo a "1,00" - un numero che nessuno ha scritto, salvato senza un segno.
   */
  it("la quinta cifra non fa collassare il numero", () => {
    expect(digita("10005", 2)).toBe("10005");
    expect(digita("10005", 0)).toBe("10005");
  });

  it("cancellare una cifra da un numero di migliaia lo lascia intero", () => {
    // "1000" meno l'ultimo carattere, come lo consegna la tastiera.
    const nelForm = parseToNumber(formatNumber("100", 2));
    expect(numberToDisplay(nelForm, 2)).toBe("100");
  });

  it("i decimali si scrivono ancora, cifra per cifra", () => {
    expect(digita("12,5", 1)).toBe("12,5");
    expect(digita("0,75", 2)).toBe("0,75");
    expect(digita("3.2", 1)).toBe("3,2");
  });

  /**
   * Nessun separatore di migliaia, ed e' la ragione per cui i test sopra
   * passano: un campo che non scrive niente da se' non ha piu' un punto da
   * interpretare. Numeri di quattro cifre sono il massimo che questa app
   * chiede (kcal, grammi, carichi), e la leggibilita' persa vale meno di un
   * valore corrotto.
   */
  it("non aggiunge separatori di migliaia", () => {
    expect(formatNumber("1234", 0)).toBe("1234");
    expect(numberToDisplay(12000, 0)).toBe("12000");
  });
});

describe("punto digitato al posto della virgola", () => {
  /**
   * Il difetto che questo test blocca: la tastiera numerica di Android offre
   * sia la virgola sia il punto. Chi digitava "3.2" vedeva il campo diventare
   * "32", e salvava dieci volte il valore che intendeva.
   */
  it("legge il punto come separatore decimale", () => {
    expect(formatNumber("3.2", 1)).toBe("3,2");
    expect(parseToNumber(formatNumber("3.2", 1))).toBe("3.2");
  });

  it("un secondo separatore non sposta il primo", () => {
    expect(formatNumber("3,2.5", 2)).toBe("3,25");
  });
});
