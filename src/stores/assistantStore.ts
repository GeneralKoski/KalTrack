import { logger } from "@/src/utils/logger";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/**
 * Le preferenze dell'assistente: oggi una sola, la risposta parlata.
 *
 * C'e' stata anche l'auto-conferma per tool ("non chiedermelo piu'"), tolta il
 * 3 settembre 2026: un'azione che scrive nel diario si conferma sempre, e una
 * preferenza che si poteva accendere per sbaglio da una spunta dentro una
 * scheda valeva meno del tocco che risparmiava.
 */
interface AssistantStore {
  /** Risposta parlata, attiva salvo diverso volere. */
  voiceReplyEnabled: boolean;
  isHydrated: boolean;
  setVoiceReplyEnabled: (enabled: boolean) => void;
}

export const useAssistantStore = create<AssistantStore>()(
  persist(
    (set) => ({
      voiceReplyEnabled: true,
      isHydrated: false,

      setVoiceReplyEnabled: (voiceReplyEnabled) => set({ voiceReplyEnabled }),
    }),
    {
      name: "app_assistant",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        voiceReplyEnabled: state.voiceReplyEnabled,
      }),
      onRehydrateStorage: () => (state, error) => {
        if (error) logger.error("[assistant] rilettura preferenze fallita", error);
        useAssistantStore.setState({ isHydrated: true });
        if (state) state.isHydrated = true;
      },
    },
  ),
);
