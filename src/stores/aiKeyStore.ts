import { logger } from "@/src/utils/logger";
import * as SecureStore from "expo-secure-store";
import { create } from "zustand";

/**
 * La chiave AI personale, che si sovrappone a quella dell'app.
 *
 * **Non e' l'unica via, ed e' la meno usata.** La chiave che accende l'AI al
 * primo avvio e' quella condivisa, che sta in `EXPO_PUBLIC_GEMINI_API_KEY` e
 * quindi nel bundle: e' una scelta dichiarata in `CLAUDE.md` § AI, per avere
 * l'assistente attivo senza configurazione e a costo zero sul Free Tier.
 * Questo store serve a chi vuole mettere la propria - perche' la quota
 * condivisa e' finita, o perche' non si fida di quella di qualcun altro - e
 * `aiKey()` in `ai/config.ts` gli da' la precedenza.
 *
 * Per un periodo la chiave condivisa era stata tolta e questa era l'unica via.
 * Il motivo era che chiunque avesse l'APK poteva estrarla dal bundle e
 * consumarne la quota; il motivo per cui e' tornata e' che l'APK non si
 * distribuisce, e chiedere una chiave a chi installa l'app spegneva l'AI al
 * primo avvio, cioe' l'unica volta in cui conta che funzioni.
 *
 * SecureStore e **non** la tabella `settings`: quella si sincronizza, e la
 * chiave finirebbe sul server dentro `sync_records`, in chiaro. Sarebbe stata
 * la strada piu' corta e avrebbe rifatto lo stesso danno da un'altra parte.
 *
 * In memoria dopo l'avvio perche' `hasAiKey()` viene chiamata anche in
 * render: leggere SecureStore a ogni disegno vorrebbe dire renderla asincrona
 * e far comparire i riquadri dell'AI con un lampo di ritardo.
 */
const PRIMARY_KEY_STORAGE = "kaltrack_ai_key";
const LEGACY_KEY_STORAGE = "kaltrack_groq_key";

interface AiKeyStore {
  key: string | null;
  isHydrated: boolean;
  restore: () => Promise<void>;
  save: (key: string) => Promise<void>;
  clear: () => Promise<void>;
}

export const useAiKeyStore = create<AiKeyStore>()((set) => ({
  key: null,
  isHydrated: false,

  restore: async () => {
    try {
      // Pulisce l'eventuale vecchia chiave Groq legacy salvata in precedenza
      try {
        await SecureStore.deleteItemAsync(LEGACY_KEY_STORAGE);
      } catch {
        // Ignora se non esiste
      }

      let key = await SecureStore.getItemAsync(PRIMARY_KEY_STORAGE);
      // Se la chiave inizia con 'gsk_' era una vecchia chiave Groq: la scarta
      if (key && key.startsWith("gsk_")) {
        await SecureStore.deleteItemAsync(PRIMARY_KEY_STORAGE);
        key = null;
      }

      set({ key, isHydrated: true });
    } catch (error) {
      logger.error("[ai] lettura della chiave fallita", error);
      set({ isHydrated: true });
    }
  },

  save: async (key) => {
    const pulita = key.trim();
    await SecureStore.setItemAsync(PRIMARY_KEY_STORAGE, pulita);
    set({ key: pulita });
  },

  clear: async () => {
    await Promise.all([
      SecureStore.deleteItemAsync(PRIMARY_KEY_STORAGE),
      SecureStore.deleteItemAsync(LEGACY_KEY_STORAGE),
    ]);
    set({ key: null });
  },
}));
