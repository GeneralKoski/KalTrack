import { formatGrams, toGrams } from "@/src/domain/serving";

describe("formatGrams", () => {
  it("scrive gli interi senza decimali", () => {
    expect(formatGrams(125)).toBe("125");
  });

  // La virgola: e' il separatore italiano, e il campo la riaccetta in lettura.
  it("usa la virgola per i decimali", () => {
    expect(formatGrams(62.5)).toBe("62,5");
  });

  it("non lascia zeri in coda", () => {
    expect(formatGrams(62.0)).toBe("62");
    expect(formatGrams(62.5)).toBe("62,5");
  });
});
describe("toGrams", () => {
  it("accetta la virgola come separatore decimale", () => {
    expect(toGrams("12,5")).toBeCloseTo(12.5);
  });

  it("su testo non numerico o negativo torna zero", () => {
    expect(toGrams("")).toBe(0);
    expect(toGrams("abc")).toBe(0);
    expect(toGrams("-30")).toBe(0);
  });
});
