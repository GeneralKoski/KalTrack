import {
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

  it("toglie i punti delle migliaia", () => {
    expect(parseToNumber("1.234,5")).toBe("1234.5");
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
    expect(numberToDisplay(1234.5, 1)).toBe("1.234,5");
  });

  /** Il giro completo non deve cambiare il numero. */
  it("regge il giro form -> schermo -> form", () => {
    const inForm = parseToNumber("1.234,5");
    expect(Number(inForm)).toBe(1234.5);
    expect(parseToNumber(numberToDisplay(inForm, 1))).toBe(inForm);
  });
});
