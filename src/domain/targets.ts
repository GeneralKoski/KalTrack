export type Sex = "male" | "female";
export type ActivityLevel =
  | "sedentary"
  | "light"
  | "moderate"
  | "active"
  | "very_active";
export type Goal = "cut" | "maintain" | "bulk";

export const ACTIVITY_FACTORS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

export const GOAL_KCAL_FACTOR: Record<Goal, number> = {
  cut: 0.85,
  maintain: 1,
  bulk: 1.1,
};

const PROTEIN_G_PER_KG = 2;
const FAT_G_PER_KG = 0.9;

/** Età compiuta alla data indicata. `birthdate` in formato YYYY-MM-DD. */
export function ageAt(birthdate: string, on: Date): number {
  const [year, month, day] = birthdate.split("-").map(Number);
  let age = on.getFullYear() - year;
  const monthDiff = on.getMonth() + 1 - month;
  if (monthDiff < 0 || (monthDiff === 0 && on.getDate() < day)) age -= 1;
  return age;
}

/** Metabolismo basale, formula di Mifflin-St Jeor. */
export function bmr(input: {
  sex: Sex;
  weightKg: number;
  heightCm: number;
  age: number;
}): number {
  const base = 10 * input.weightKg + 6.25 * input.heightCm - 5 * input.age;
  return input.sex === "male" ? base + 5 : base - 161;
}

export const tdee = (bmrValue: number, activity: ActivityLevel): number =>
  bmrValue * ACTIVITY_FACTORS[activity];

export interface TargetSuggestion {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

/**
 * Obiettivi suggeriti. Proteine e grassi si fissano sul peso corporeo, i
 * carboidrati assorbono il residuo calorico (mai sotto zero).
 */
export function suggestTargets(input: {
  sex: Sex;
  weightKg: number;
  heightCm: number;
  age: number;
  activity: ActivityLevel;
  goal: Goal;
}): TargetSuggestion {
  const kcal = Math.round(
    tdee(bmr(input), input.activity) * GOAL_KCAL_FACTOR[input.goal],
  );
  const proteinG = Math.round(input.weightKg * PROTEIN_G_PER_KG);
  const fatG = Math.round(input.weightKg * FAT_G_PER_KG);
  const carbsG = Math.max(0, Math.round((kcal - proteinG * 4 - fatG * 9) / 4));
  return { kcal, proteinG, carbsG, fatG };
}
