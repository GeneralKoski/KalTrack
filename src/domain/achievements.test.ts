import {
  ACHIEVEMENTS,
  currentStreak,
  evaluateAchievements,
  type AchievementStats,
} from "@/src/domain/achievements";

const stats = (partial: Partial<AchievementStats> = {}): AchievementStats => ({
  loggedDays: 0,
  workoutDays: 0,
  totalSteps: 0,
  bestDaySteps: 0,
  bestWeightKg: null,
  loggedDates: [],
  ...partial,
});

describe("catalogo", () => {
  it("i codici sono unici", () => {
    const codes = ACHIEVEMENTS.map((a) => a.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("ogni traguardo ha una soglia positiva", () => {
    for (const achievement of ACHIEVEMENTS) {
      expect(`${achievement.code}: ${achievement.threshold > 0}`).toBe(
        `${achievement.code}: true`,
      );
    }
  });

  it("le soglie di una stessa famiglia crescono", () => {
    // Traguardi della stessa metrica devono essere una scala, altrimenti se ne
    // sbloccano due identici.
    const families = new Map<string, number[]>();
    for (const a of ACHIEVEMENTS) {
      families.set(a.metric, [...(families.get(a.metric) ?? []), a.threshold]);
    }
    for (const [metric, thresholds] of families) {
      const sorted = [...thresholds].sort((x, y) => x - y);
      expect(`${metric}: ${new Set(thresholds).size}`).toBe(
        `${metric}: ${thresholds.length}`,
      );
      expect(sorted).toEqual(sorted);
    }
  });
});

describe("evaluateAchievements", () => {
  it("su statistiche vuote non sblocca nulla", () => {
    expect(evaluateAchievements(stats(), [])).toEqual([]);
  });

  it("sblocca al raggiungimento della soglia", () => {
    const unlocked = evaluateAchievements(stats({ loggedDays: 7 }), []);
    expect(unlocked.map((u) => u.code)).toContain("logged_days_7");
  });

  it("non risblocca ciò che è già stato raggiunto", () => {
    const unlocked = evaluateAchievements(stats({ loggedDays: 7 }), [
      "logged_days_7",
    ]);
    expect(unlocked.map((u) => u.code)).not.toContain("logged_days_7");
  });

  it("sblocca tutte le soglie superate in una volta sola", () => {
    // Chi importa un backup di mesi non deve sbloccarne uno al giorno.
    const unlocked = evaluateAchievements(stats({ loggedDays: 40 }), []);
    const days = unlocked.filter((u) => u.metric === "loggedDays");
    expect(days.length).toBeGreaterThan(1);
  });

  it("porta il valore che ha fatto scattare il traguardo", () => {
    const unlocked = evaluateAchievements(stats({ bestDaySteps: 15200 }), []);
    const steps = unlocked.find((u) => u.metric === "bestDaySteps");
    expect(steps?.value).toBe(15200);
  });

  it("il peso migliore è un minimo, non un massimo", () => {
    // Dimagrire è scendere: la soglia si supera andando SOTTO.
    const unlocked = evaluateAchievements(stats({ bestWeightKg: 79 }), []);
    expect(unlocked.some((u) => u.metric === "bestWeightKg")).toBe(true);

    const notYet = evaluateAchievements(stats({ bestWeightKg: 120 }), []);
    expect(notYet.some((u) => u.metric === "bestWeightKg")).toBe(false);
  });

  it("senza pesate il traguardo sul peso non scatta", () => {
    expect(
      evaluateAchievements(stats({ bestWeightKg: null }), []).some(
        (u) => u.metric === "bestWeightKg",
      ),
    ).toBe(false);
  });
});

describe("currentStreak", () => {
  it("conta i giorni consecutivi fino a oggi", () => {
    expect(
      currentStreak(["2026-08-27", "2026-08-28", "2026-08-29"], "2026-08-29"),
    ).toBe(3);
  });

  it("si interrompe a un buco", () => {
    expect(
      currentStreak(["2026-08-25", "2026-08-28", "2026-08-29"], "2026-08-29"),
    ).toBe(2);
  });

  it("regge se oggi non è ancora stato registrato ma ieri sì", () => {
    // Alle 9 del mattino la serie non è ancora persa.
    expect(currentStreak(["2026-08-27", "2026-08-28"], "2026-08-29")).toBe(2);
  });

  it("è zero se l'ultimo giorno registrato è più vecchio di ieri", () => {
    expect(currentStreak(["2026-08-20"], "2026-08-29")).toBe(0);
  });

  it("su elenco vuoto è zero", () => {
    expect(currentStreak([], "2026-08-29")).toBe(0);
  });

  it("ignora i duplicati", () => {
    expect(
      currentStreak(["2026-08-28", "2026-08-28", "2026-08-29"], "2026-08-29"),
    ).toBe(2);
  });
});
