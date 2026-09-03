/**
 * L'ordine dei passi del primo avvio, e nient'altro: la persistenza (dove sta
 * il passo corrente, dove il completamento) vive in `settings` via
 * `onboardingStore`, non qui.
 */
export const ONBOARDING_STEPS = [
  "OnboardingLanguage",
  "OnboardingWelcome",
  "OnboardingProfileBasics",
  "OnboardingWeight",
  "OnboardingActivityGoal",
  "OnboardingTargets",
  "OnboardingTheme",
] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export const FIRST_ONBOARDING_STEP: OnboardingStep = ONBOARDING_STEPS[0];

/** Il passo dopo `step`, o `null` se `step` è l'ultimo. */
export function nextOnboardingStep(step: OnboardingStep): OnboardingStep | null {
  const index = ONBOARDING_STEPS.indexOf(step);
  return index >= 0 && index < ONBOARDING_STEPS.length - 1
    ? ONBOARDING_STEPS[index + 1]
    : null;
}

/** Un valore letto da `settings` non e' garantito valido: puo' venire da una
 *  versione vecchia dell'app o da un dato corrotto. */
export function isOnboardingStep(value: string | null): value is OnboardingStep {
  return (ONBOARDING_STEPS as readonly string[]).includes(value ?? "");
}
