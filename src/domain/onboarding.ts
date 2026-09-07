/**
 * L'ordine dei passi del primo avvio, e nient'altro: la persistenza (dove sta
 * il passo corrente, dove il completamento) vive in `settings` via
 * `onboardingStore`, non qui.
 *
 * **Erano sette per nove campi**, e i passi 3-6 ne portavano da uno a tre
 * ciascuno con il 70-80% di schermo vuoto: si toccava "Avanti" sei volte per
 * scrivere quel che sta in una pagina. Dall'8 settembre 2026 sono quattro.
 *
 * Due conseguenze da tenere presenti:
 *
 * - i nomi tolti (`OnboardingLanguage`, `OnboardingProfileBasics`,
 *   `OnboardingWeight`, `OnboardingActivityGoal`, `OnboardingTargets`) possono
 *   ancora stare scritti in `settings` su un telefono che aveva abbandonato il
 *   wizard a meta'. `isOnboardingStep` li scarta e si riparte dal primo passo:
 *   quattro schermate, e i dati gia' scritti si ritrovano nei campi.
 * - l'ultimo passo non e' piu' l'aspetto ma l'account, che prima era il
 *   SECONDO - un modulo di registrazione prima ancora di aver visto l'app, con
 *   "Salta per ora" (la via che quasi tutti prendono) come bottone piu' lontano
 *   dello schermo.
 */
export const ONBOARDING_STEPS = [
  "OnboardingWelcome",
  "OnboardingProfile",
  "OnboardingTheme",
  "OnboardingAccount",
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
