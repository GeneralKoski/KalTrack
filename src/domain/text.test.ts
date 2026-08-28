import { normalizeText } from "@/src/domain/text";

describe("normalizeText", () => {
  it("porta in minuscolo", () => {
    expect(normalizeText("Petto di Pollo")).toBe("petto di pollo");
  });

  it("toglie gli accenti", () => {
    expect(normalizeText("Caffè")).toBe("caffe");
    expect(normalizeText("Purè")).toBe("pure");
    expect(normalizeText("Ragù")).toBe("ragu");
  });

  it("comprime gli spazi multipli e taglia i bordi", () => {
    expect(normalizeText("  yogurt   greco  ")).toBe("yogurt greco");
  });

  it("toglie la punteggiatura", () => {
    expect(normalizeText("Fior di latte, 20%")).toBe("fior di latte 20");
  });

  it("tiene le cifre", () => {
    expect(normalizeText("Yogurt greco 0%")).toBe("yogurt greco 0");
  });

  it("su stringa vuota ritorna stringa vuota", () => {
    expect(normalizeText("")).toBe("");
  });

  it("su soli separatori ritorna stringa vuota", () => {
    expect(normalizeText("  -- ,, ")).toBe("");
  });

  it("è idempotente", () => {
    const once = normalizeText("Caffè D'Orzo");
    expect(normalizeText(once)).toBe(once);
  });
});
