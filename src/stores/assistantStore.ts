import { logger } from "@/src/utils/logger";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/**
 * Azioni per cui l'utente ha scelto "non chiedere più conferma".
 *
 * La preferenza è PER CAPABILITY e non globale: si può rendere istantaneo
 * "aggiungi passi" tenendo la conferma su "aggiungi al diario". Le
 * cancellazioni non sono mai auto-confermabili, indipendentemente da cosa
 * c'è qui dentro: quella regola vive nel codice che decide, non nei dati.
 */
export const NEVER_AUTO_CONFIRM = ["delete_entry"] as const;

interface AssistantStore {
  /** Risposta parlata, attiva salvo diverso volere. */
  voiceReplyEnabled: boolean;
  /** Nomi dei tool auto-confermati. */
  autoConfirm: string[];
  isHydrated: boolean;
  setVoiceReplyEnabled: (enabled: boolean) => void;
  allowAutoConfirm: (toolName: string) => void;
  revokeAutoConfirm: (toolName: string) => void;
  isAutoConfirmed: (toolName: string) => boolean;
}

export const useAssistantStore = create<AssistantStore>()(
  persist(
    (set, get) => ({
      voiceReplyEnabled: true,
      autoConfirm: [],
      isHydrated: false,

      setVoiceReplyEnabled: (voiceReplyEnabled) => set({ voiceReplyEnabled }),

      allowAutoConfirm: (toolName) => {
        if ((NEVER_AUTO_CONFIRM as readonly string[]).includes(toolName)) return;
        const current = get().autoConfirm;
        if (current.includes(toolName)) return;
        set({ autoConfirm: [...current, toolName] });
      },

      revokeAutoConfirm: (toolName) =>
        set({ autoConfirm: get().autoConfirm.filter((n) => n !== toolName) }),

      isAutoConfirmed: (toolName) =>
        !(NEVER_AUTO_CONFIRM as readonly string[]).includes(toolName) &&
        get().autoConfirm.includes(toolName),
    }),
    {
      name: "app_assistant",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        voiceReplyEnabled: state.voiceReplyEnabled,
        autoConfirm: state.autoConfirm,
      }),
      onRehydrateStorage: () => (state, error) => {
        if (error) logger.error("[assistant] rilettura preferenze fallita", error);
        useAssistantStore.setState({ isHydrated: true });
        if (state) state.isHydrated = true;
      },
    },
  ),
);
