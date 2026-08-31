import {
  activeMultiplier,
  formatGrams,
  SERVING_MULTIPLIERS,
  servingGrams,
} from "@/src/domain/serving";

describe("servingGrams", () => {
  it("moltiplica la porzione", () => {
    expect(servingGrams(125, 2)).toBe(250);
    expect(servingGrams(10, 3)).toBe(30);
  });

  // Mezzo vasetto sono 62,5 g: arrotondare a 63 cambierebbe i valori salvati
  // per far sembrare piu' bello il campo.
  it("non arrotonda i mezzi", () => {
    expect(servingGrams(125, 0.5)).toBe(62.5);
  });

  it("con una porzione non valida torna zero invece di NaN", () => {
    expect(servingGrams(0, 2)).toBe(0);
    expect(servingGrams(-125, 2)).toBe(0);
  });
});

describe("activeMultiplier", () => {
  it("riconosce i grammi che corrispondono a un multiplo", () => {
    expect(activeMultiplier(250, 125)).toBe(2);
    expect(activeMultiplier(62.5, 125)).toBe(0.5);
  });

  /*
   * 180 g non e' un numero di vasetti: nessuna scorciatoia deve risultare
   * attiva, altrimenti la schermata afferma una cosa falsa su quel che hai
   * digitato.
   */
  it("su una quantita' digitata a mano non attiva niente", () => {
    expect(activeMultiplier(180, 125)).toBeNull();
  });

  it("tollera lo scarto di un centesimo di grammo", () => {
    expect(activeMultiplier(250.005, 125)).toBe(2);
  });

  it("senza una porzione valida non attiva niente", () => {
    expect(activeMultiplier(100, 0)).toBeNull();
  });

  it("copre tutte le scorciatoie offerte", () => {
    for (const multiplier of SERVING_MULTIPLIERS) {
      expect(activeMultiplier(servingGrams(125, multiplier), 125)).toBe(
        multiplier,
      );
    }
  });
});

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
