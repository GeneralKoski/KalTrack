import {
  addDays,
  addMonths,
  clampDay,
  dayLabelKind,
  isRealIsoDate,
  isWithinRange,
  latestDay,
  monthGrid,
  startOfMonth,
  startOfWeek,
  todayIso,
  toIsoDate,
} from "@/src/domain/date";

describe("toIsoDate", () => {
  it("usa la data locale, non UTC", () => {
    // 23:30 locale: con toISOString() in Europa/Roma diventerebbe il giorno dopo.
    expect(toIsoDate(new Date(2026, 7, 28, 23, 30))).toBe("2026-08-28");
  });

  it("mette lo zero davanti a mese e giorno", () => {
    expect(toIsoDate(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});

describe("todayIso", () => {
  it("formatta la data passata", () => {
    expect(todayIso(new Date(2026, 7, 28, 10, 0))).toBe("2026-08-28");
  });
});

describe("addDays", () => {
  it("somma giorni", () => {
    expect(addDays("2026-08-28", 3)).toBe("2026-08-31");
  });

  it("attraversa il cambio di mese", () => {
    expect(addDays("2026-08-31", 1)).toBe("2026-09-01");
  });

  it("attraversa il cambio di anno", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("sottrae con valori negativi", () => {
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("gestisce l'anno bisestile", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  });

  it("con 0 ritorna la stessa data", () => {
    expect(addDays("2026-08-28", 0)).toBe("2026-08-28");
  });
});

describe("startOfWeek", () => {
  it("torna al lunedì", () => {
    // 2026-08-28 è un venerdì.
    expect(startOfWeek("2026-08-28")).toBe("2026-08-24");
  });

  it("su una domenica torna al lunedì precedente", () => {
    expect(startOfWeek("2026-08-30")).toBe("2026-08-24");
  });

  it("su un lunedì resta lo stesso giorno", () => {
    expect(startOfWeek("2026-08-24")).toBe("2026-08-24");
  });

  it("attraversa il cambio di mese", () => {
    // 2026-09-02 è un mercoledì: il lunedì cade in agosto.
    expect(startOfWeek("2026-09-02")).toBe("2026-08-31");
  });
});

describe("dayLabelKind", () => {
  it("riconosce oggi, ieri e domani", () => {
    expect(dayLabelKind("2026-08-28", "2026-08-28")).toBe("today");
    expect(dayLabelKind("2026-08-27", "2026-08-28")).toBe("yesterday");
    expect(dayLabelKind("2026-08-29", "2026-08-28")).toBe("tomorrow");
    expect(dayLabelKind("2026-08-01", "2026-08-28")).toBe("other");
  });

  it("funziona a cavallo di mese", () => {
    expect(dayLabelKind("2026-08-31", "2026-09-01")).toBe("yesterday");
  });
});

describe("isRealIsoDate", () => {
  it("accetta una data che esiste", () => {
    expect(isRealIsoDate("2026-08-29")).toBe(true);
    expect(isRealIsoDate("2024-02-29")).toBe(true);
  });

  /**
   * Il difetto che questo test blocca: il modello risolve "ieri" da se', e il
   * 1 marzo di un anno non bisestile puo' scrivere "2026-02-29". Con la sola
   * verifica di forma quella riga finiva a database in un giorno dove nessuna
   * schermata puo' andare a correggerla, ma che continuava a comparire
   * nell'ultimo peso registrato.
   */
  it("rifiuta il 29 febbraio di un anno non bisestile", () => {
    expect(isRealIsoDate("2026-02-29")).toBe(false);
  });

  it("rifiuta mesi e giorni fuori scala", () => {
    expect(isRealIsoDate("2026-13-01")).toBe(false);
    expect(isRealIsoDate("2026-00-10")).toBe(false);
    expect(isRealIsoDate("2026-04-31")).toBe(false);
    expect(isRealIsoDate("2026-01-00")).toBe(false);
  });

  it("rifiuta quel che non ha nemmeno la forma giusta", () => {
    expect(isRealIsoDate("29/08/2026")).toBe(false);
    expect(isRealIsoDate("2026-8-9")).toBe(false);
    expect(isRealIsoDate("")).toBe(false);
  });
});

describe("i limiti della navigazione fra i giorni", () => {
  const OGGI = "2026-08-30";

  it("non si va prima dell'inizio del 2026", () => {
    expect(isWithinRange("2026-01-01", OGGI)).toBe(true);
    expect(isWithinRange("2025-12-31", OGGI)).toBe(false);
  });

  it("si arriva fino a un mese avanti, e non oltre", () => {
    expect(latestDay(OGGI)).toBe("2026-09-29");
    expect(isWithinRange("2026-09-29", OGGI)).toBe(true);
    expect(isWithinRange("2026-09-30", OGGI)).toBe(false);
  });

  it("una data fuori limite viene riportata dentro", () => {
    expect(clampDay("2019-05-04", OGGI)).toBe("2026-01-01");
    expect(clampDay("2027-01-01", OGGI)).toBe("2026-09-29");
    // Una data buona resta com'e': il clamp non deve spostare niente.
    expect(clampDay("2026-08-12", OGGI)).toBe("2026-08-12");
  });
});

describe("monthGrid", () => {
  it("dispone il mese in settimane da lunedi' a domenica", () => {
    // Agosto 2026 comincia di sabato: cinque caselle vuote prima.
    const griglia = monthGrid("2026-08-15");

    expect(griglia[0].slice(0, 5)).toEqual([null, null, null, null, null]);
    expect(griglia[0][5]).toBe("2026-08-01");
    expect(griglia[0][6]).toBe("2026-08-02");
  });

  it("riempie di null e non con i giorni del mese vicino", () => {
    const griglia = monthGrid("2026-08-15");
    const ultima = griglia[griglia.length - 1];

    // Il 31 luglio dentro agosto inviterebbe a toccarlo, e toccarlo dovrebbe
    // cambiare mese: non e' quello che ci si aspetta da quella casella.
    expect(griglia.flat().filter((d) => d !== null)).toHaveLength(31);
    expect(ultima.some((d) => d === null)).toBe(true);
  });

  /**
   * Un mese ne occupa da quattro a sei: senza un numero fisso, il foglio che
   * contiene il calendario cambierebbe altezza scorrendo i mesi.
   */
  it("sono sempre sei settimane, qualunque mese sia", () => {
    // Febbraio 2027 comincia di lunedi' e ha ventotto giorni: ne basterebbero
    // quattro. Settembre 2026 ne riempirebbe cinque, agosto 2026 sei.
    expect(monthGrid("2027-02-10")).toHaveLength(6);
    expect(monthGrid("2026-09-10")).toHaveLength(6);
    expect(monthGrid("2026-08-10")).toHaveLength(6);
  });

  it("ogni settimana ha sette caselle", () => {
    for (const mese of ["2026-01-10", "2026-02-10", "2028-02-10"]) {
      expect(monthGrid(mese).every((w) => w.length === 7)).toBe(true);
    }
  });

  it("febbraio bisestile ha ventinove giorni", () => {
    expect(monthGrid("2028-02-10").flat().filter(Boolean)).toHaveLength(29);
  });
});

describe("addMonths e startOfMonth", () => {
  it("resta sul primo del mese", () => {
    expect(startOfMonth("2026-08-30")).toBe("2026-08-01");
    expect(addMonths("2026-08-01", 1)).toBe("2026-09-01");
    expect(addMonths("2026-01-01", -1)).toBe("2025-12-01");
  });

  it("non scivola su un mese piu' corto", () => {
    // Il 31 gennaio + 1 mese non deve diventare il 3 marzo.
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-01");
  });
});
