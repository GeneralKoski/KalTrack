import {
  FASTING_PROTOCOLS,
  fastingProgress,
  formatDuration,
  hoursBetween,
} from "@/src/domain/fasting";

const at = (iso: string) => new Date(iso);

describe("hoursBetween", () => {
  it("calcola le ore trascorse", () => {
    expect(
      hoursBetween("2026-08-28T20:00:00.000Z", at("2026-08-29T04:00:00.000Z")),
    ).toBeCloseTo(8);
  });

  it("gestisce le frazioni di ora", () => {
    expect(
      hoursBetween("2026-08-28T20:00:00.000Z", at("2026-08-28T20:30:00.000Z")),
    ).toBeCloseTo(0.5);
  });

  it("con una fine precedente all'inizio ritorna zero, non un negativo", () => {
    // Un orologio riportato indietro non deve produrre un digiuno negativo.
    expect(
      hoursBetween("2026-08-29T04:00:00.000Z", at("2026-08-28T20:00:00.000Z")),
    ).toBe(0);
  });
});

describe("fastingProgress", () => {
  const started = "2026-08-28T20:00:00.000Z";

  it("è la frazione di obiettivo raggiunta", () => {
    const progress = fastingProgress({
      startedAt: started,
      targetHours: 16,
      now: at("2026-08-29T04:00:00.000Z"),
    });
    expect(progress.elapsedHours).toBeCloseTo(8);
    expect(progress.ratio).toBeCloseTo(0.5);
    expect(progress.completed).toBe(false);
  });

  it("si ferma a 1 anche oltre l'obiettivo", () => {
    const progress = fastingProgress({
      startedAt: started,
      targetHours: 16,
      now: at("2026-08-29T20:00:00.000Z"),
    });
    expect(progress.ratio).toBe(1);
    expect(progress.completed).toBe(true);
    // Le ore trascorse però continuano a crescere: il digiuno è più lungo.
    expect(progress.elapsedHours).toBeCloseTo(24);
  });

  it("senza obiettivo conta solo le ore, senza percentuale", () => {
    const progress = fastingProgress({
      startedAt: started,
      targetHours: null,
      now: at("2026-08-29T04:00:00.000Z"),
    });
    expect(progress.elapsedHours).toBeCloseTo(8);
    expect(progress.ratio).toBeNull();
    expect(progress.completed).toBe(false);
  });
});

describe("formatDuration", () => {
  it("mostra ore e minuti", () => {
    expect(formatDuration(8.5)).toBe("8h 30m");
  });

  it("sotto l'ora mostra solo i minuti", () => {
    expect(formatDuration(0.75)).toBe("45m");
  });

  it("a ore intere non mostra i minuti a zero", () => {
    expect(formatDuration(16)).toBe("16h");
  });

  it("a zero mostra zero minuti invece di stringa vuota", () => {
    expect(formatDuration(0)).toBe("0m");
  });
});

describe("protocolli", () => {
  it("hanno ore di digiuno e di alimentazione che sommano a 24", () => {
    for (const protocol of FASTING_PROTOCOLS) {
      expect(`${protocol.code}: ${protocol.fastingHours + protocol.eatingHours}`).toBe(
        `${protocol.code}: 24`,
      );
    }
  });

  it("i codici sono unici", () => {
    const codes = FASTING_PROTOCOLS.map((p) => p.code);
    expect(new Set(codes).size).toBe(codes.length);
  });
});
