import {
  FIRST_ONBOARDING_STEP,
  isOnboardingStep,
  nextOnboardingStep,
  ONBOARDING_STEPS,
} from "@/src/domain/onboarding";

describe("nextOnboardingStep", () => {
  it("segue l'ordine dichiarato", () => {
    for (let i = 0; i < ONBOARDING_STEPS.length - 1; i++) {
      expect(nextOnboardingStep(ONBOARDING_STEPS[i])).toBe(ONBOARDING_STEPS[i + 1]);
    }
  });

  it("torna null sull'ultimo passo", () => {
    expect(nextOnboardingStep(ONBOARDING_STEPS[ONBOARDING_STEPS.length - 1])).toBeNull();
  });
});

describe("isOnboardingStep", () => {
  it("riconosce i passi validi", () => {
    expect(isOnboardingStep(FIRST_ONBOARDING_STEP)).toBe(true);
  });

  it("respinge null e valori sconosciuti", () => {
    expect(isOnboardingStep(null)).toBe(false);
    expect(isOnboardingStep("QualcosaDAltro")).toBe(false);
  });
});
