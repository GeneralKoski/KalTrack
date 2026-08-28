import { logger } from "@/src/utils/logger";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/** `system` segue il tema del telefono; gli altri due lo forzano. */
export type ThemeMode = "system" | "light" | "dark";

export const THEME_MODES: ThemeMode[] = ["system", "light", "dark"];

interface ThemeStore {
  mode: ThemeMode;
  /** Falso finché la preferenza salvata non è stata riletta da AsyncStorage. */
  isHydrated: boolean;
  setMode: (mode: ThemeMode) => void;
}

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set) => ({
      mode: "system",
      isHydrated: false,
      setMode: (mode) => set({ mode }),
    }),
    {
      name: "app_theme",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ mode: state.mode }),
      // Si sblocca anche in caso di errore: il gate d'avvio aspetta questo
      // flag, e restare a false terrebbe l'app sulla splash per sempre.
      onRehydrateStorage: () => (state, error) => {
        if (error) logger.error("[theme] rilettura preferenza fallita", error);
        useThemeStore.setState({ isHydrated: true });
        if (state) state.isHydrated = true;
      },
    },
  ),
);
