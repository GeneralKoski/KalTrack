import {
  ACTIVITY_FACTORS,
  ageAt,
  bmr,
  suggestTargets,
  targetStatus,
  tdee,
} from "@/src/domain/targets";

describe("ageAt", () => {
  it("calcola l'età compiuta", () => {
    expect(ageAt("1995-06-15", new Date(2026, 7, 28))).toBe(31);
  });

  it("non conta il compleanno non ancora arrivato", () => {
    expect(ageAt("1995-12-31", new Date(2026, 7, 28))).toBe(30);
  });

  it("conta il compleanno del giorno stesso", () => {
    expect(ageAt("1995-08-28", new Date(2026, 7, 28))).toBe(31);
  });

  it("non conta il compleanno del giorno dopo", () => {
    expect(ageAt("1995-08-29", new Date(2026, 7, 28))).toBe(30);
  });
});

describe("bmr", () => {
  // Mifflin-St Jeor: 10*kg + 6.25*cm - 5*eta + 5 (uomo) / -161 (donna)
  it("calcola il metabolismo basale per un uomo", () => {
    expect(bmr({ sex: "male", weightKg: 80, heightCm: 180, age: 30 })).toBeCloseTo(
      10 * 80 + 6.25 * 180 - 5 * 30 + 5,
    );
  });

  it("calcola il metabolismo basale per una donna", () => {
    expect(
      bmr({ sex: "female", weightKg: 60, heightCm: 165, age: 30 }),
    ).toBeCloseTo(10 * 60 + 6.25 * 165 - 5 * 30 - 161);
  });
});

describe("tdee", () => {
  it("moltiplica per il fattore di attività", () => {
    expect(tdee(1800, "moderate")).toBeCloseTo(1800 * ACTIVITY_FACTORS.moderate);
  });

  it("i fattori crescono con l'attività", () => {
    const levels = [
      "sedentary",
      "light",
      "moderate",
      "active",
      "very_active",
    ] as const;
    const values = levels.map((l) => ACTIVITY_FACTORS[l]);
    expect([...values].sort((a, b) => a - b)).toEqual(values);
  });
});

describe("suggestTargets", () => {
  const input = {
    sex: "male" as const,
    weightKg: 80,
    heightCm: 180,
    age: 30,
    activity: "moderate" as const,
  };

  it("in mantenimento le calorie coincidono col TDEE arrotondato", () => {
    const expected = Math.round(tdee(bmr(input), "moderate"));
    expect(suggestTargets({ ...input, goal: "maintain" }).kcal).toBe(expected);
  });

  it("in definizione taglia il 15%", () => {
    const maintain = suggestTargets({ ...input, goal: "maintain" }).kcal;
    expect(suggestTargets({ ...input, goal: "cut" }).kcal).toBe(
      Math.round(maintain * 0.85),
    );
  });

  it("in massa aggiunge il 10%", () => {
    const maintain = suggestTargets({ ...input, goal: "maintain" }).kcal;
    expect(suggestTargets({ ...input, goal: "bulk" }).kcal).toBe(
      Math.round(maintain * 1.1),
    );
  });

  it("assegna 2 g di proteine e 0.9 g di grassi per kg", () => {
    const result = suggestTargets({ ...input, goal: "maintain" });
    expect(result.proteinG).toBe(160);
    expect(result.fatG).toBe(72);
  });

  it("i macro suggeriti ricostruiscono le calorie a meno dell'arrotondamento", () => {
    const r = suggestTargets({ ...input, goal: "maintain" });
    const fromMacros = r.proteinG * 4 + r.carbsG * 4 + r.fatG * 9;
    expect(Math.abs(fromMacros - r.kcal)).toBeLessThanOrEqual(4);
  });

  it("non produce mai carboidrati negativi", () => {
    const result = suggestTargets({
      sex: "male",
      weightKg: 120,
      heightCm: 160,
      age: 70,
      activity: "sedentary",
      goal: "cut",
    });
    expect(result.carbsG).toBeGreaterThanOrEqual(0);
  });
});

describe("targetStatus", () => {
  it("sotto obiettivo", () => {
    expect(targetStatus(1500, 2000)).toBe("under");
  });

  it("centrato entro il 5%", () => {
    expect(targetStatus(1950, 2000)).toBe("on_target");
    expect(targetStatus(2000, 2000)).toBe("on_target");
    expect(targetStatus(2100, 2000)).toBe("on_target");
  });

  it("oltre obiettivo appena superata la tolleranza", () => {
    expect(targetStatus(2101, 2000)).toBe("over");
  });

  it("senza obiettivo non si può sforare", () => {
    expect(targetStatus(3000, 0)).toBe("under");
  });

  it("a zero consumate è sotto obiettivo", () => {
    expect(targetStatus(0, 2000)).toBe("under");
  });
});
