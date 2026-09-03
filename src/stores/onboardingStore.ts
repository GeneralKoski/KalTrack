import { getSetting, setSetting } from "@/src/db/queries/settings";
import {
  FIRST_ONBOARDING_STEP,
  isOnboardingStep,
  type OnboardingStep,
} from "@/src/domain/onboarding";
import { logger } from "@/src/utils/logger";
import { create } from "zustand";

const STEP_KEY = "onboarding_step";
const COMPLETED_KEY = "onboarding_completed";

interface OnboardingStore {
  /** Falso finche' non si e' letto `settings`: la Navigation aspetta questo
   *  prima di decidere se mostrare il wizard. */
  isHydrated: boolean;
  completed: boolean;
  /** Da dove riprendere se il wizard non e' completo. Ignorato se `completed`. */
  resumeStep: OnboardingStep;
  hydrate: () => Promise<void>;
  /** Chiamata da ogni passo dopo aver salvato i propri dati. */
  advanceTo: (step: OnboardingStep) => Promise<void>;
  complete: () => Promise<void>;
}

export const useOnboardingStore = create<OnboardingStore>()((set) => ({
  isHydrated: false,
  completed: false,
  resumeStep: FIRST_ONBOARDING_STEP,

  hydrate: async () => {
    try {
      const [completedValue, stepValue] = await Promise.all([
        getSetting(COMPLETED_KEY),
        getSetting(STEP_KEY),
      ]);
      set({
        completed: completedValue !== null,
        resumeStep: isOnboardingStep(stepValue) ? stepValue : FIRST_ONBOARDING_STEP,
        isHydrated: true,
      });
    } catch (error) {
      // Si sblocca comunque: la Navigation aspetta questo flag, e restare a
      // false la terrebbe sulla splash per sempre. Il default (non completo,
      // dal primo passo) e' quello che gia' vale per un'app nuova.
      logger.error("[onboarding] lettura stato fallita", error);
      set({ isHydrated: true });
    }
  },

  advanceTo: async (step) => {
    await setSetting(STEP_KEY, step);
    set({ resumeStep: step });
  },

  complete: async () => {
    await setSetting(COMPLETED_KEY, "1");
    set({ completed: true });
  },
}));
