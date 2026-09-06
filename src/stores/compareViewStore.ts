import { logger } from "@/src/utils/logger";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/**
 * Come si guardano due foto a confronto.
 *
 * `slider` le sovrappone e si trascina un cursore per scoprire l'una o
 * l'altra; `side` le affianca. Non c'e' una migliore: il cursore rende
 * evidente la differenza quando le due inquadrature combaciano, l'affiancata
 * regge anche quando no, ed e' l'unica che permette di guardarle insieme
 * invece che una alla volta.
 */
export type CompareView = "slider" | "side";

interface CompareViewStore {
  view: CompareView;
  setView: (view: CompareView) => void;
}

/**
 * La preferenza sta in AsyncStorage e non nella tabella `settings`, come il
 * tema: e' una frase su come si guarda l'app, non un dato da portare sul
 * server. Nessun gate di idratazione - la si rilegge all'avvio, molto prima
 * che si arrivi alla schermata di confronto.
 */
export const useCompareViewStore = create<CompareViewStore>()(
  persist(
    (set) => ({
      view: "slider",
      setView: (view) => set({ view }),
    }),
    {
      name: "compare_view",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ view: state.view }),
      onRehydrateStorage: () => (_state, error) => {
        if (error) logger.warn("[confronto] preferenza non riletta", error);
      },
    },
  ),
);
