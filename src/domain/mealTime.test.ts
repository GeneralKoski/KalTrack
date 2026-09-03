import { MEAL_TYPE_IDS } from "@/src/db/migrations";
import { defaultMealTypeId } from "@/src/domain/mealTime";

const ALL = [
  { id: MEAL_TYPE_IDS.breakfast },
  { id: MEAL_TYPE_IDS.brunch },
  { id: MEAL_TYPE_IDS.lunch },
  { id: MEAL_TYPE_IDS.snack },
  { id: MEAL_TYPE_IDS.dinner },
];

const at = (hours: number, minutes = 0) =>
  new Date(2026, 8, 3, hours, minutes, 0);

describe("defaultMealTypeId", () => {
  it("propone il pasto dell'ora", () => {
    expect(defaultMealTypeId(ALL, at(7))).toBe(MEAL_TYPE_IDS.breakfast);
    expect(defaultMealTypeId(ALL, at(11))).toBe(MEAL_TYPE_IDS.brunch);
    expect(defaultMealTypeId(ALL, at(13))).toBe(MEAL_TYPE_IDS.lunch);
    expect(defaultMealTypeId(ALL, at(16, 30))).toBe(MEAL_TYPE_IDS.snack);
    expect(defaultMealTypeId(ALL, at(20))).toBe(MEAL_TYPE_IDS.dinner);
  });

  it("le ore di confine appartengono al pasto che comincia", () => {
    expect(defaultMealTypeId(ALL, at(10, 29))).toBe(MEAL_TYPE_IDS.breakfast);
    expect(defaultMealTypeId(ALL, at(10, 30))).toBe(MEAL_TYPE_IDS.brunch);
    expect(defaultMealTypeId(ALL, at(11, 29))).toBe(MEAL_TYPE_IDS.brunch);
    expect(defaultMealTypeId(ALL, at(11, 30))).toBe(MEAL_TYPE_IDS.lunch);
    expect(defaultMealTypeId(ALL, at(14, 59))).toBe(MEAL_TYPE_IDS.lunch);
    expect(defaultMealTypeId(ALL, at(15))).toBe(MEAL_TYPE_IDS.snack);
    expect(defaultMealTypeId(ALL, at(17, 59))).toBe(MEAL_TYPE_IDS.snack);
    expect(defaultMealTypeId(ALL, at(18))).toBe(MEAL_TYPE_IDS.dinner);
  });

  // I pasti sono righe di database: si cancellano e si rinominano.
  it("se il pasto dell'ora non c'e' piu' ripiega sul primo", () => {
    const senzaPranzo = ALL.filter((t) => t.id !== MEAL_TYPE_IDS.lunch);
    expect(defaultMealTypeId(senzaPranzo, at(13))).toBe(
      MEAL_TYPE_IDS.breakfast,
    );
  });

  it("con un elenco vuoto torna null", () => {
    expect(defaultMealTypeId([], at(13))).toBeNull();
  });
});
