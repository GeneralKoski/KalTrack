import { logger } from "@/src/utils/logger";
import * as SecureStore from "expo-secure-store";
import { create } from "zustand";

/**
 * La chiave Groq, che e' di chi usa l'app e non dell'app.
 *
 * Prima stava in `EXPO_PUBLIC_GROQ_API_KEY`, quindi nel bundle in chiaro e
 * uguale per tutti: chiunque avesse l'APK poteva estrarla e consumare la quota
 * di chi l'aveva messa. Ora la inserisce ciascuno per se', e il problema
 * sparisce invece di essere accettato - che una persona possa estrarre dal
 * proprio telefono una chiave sua non e' un problema.
 *
 * SecureStore e **non** la tabella `settings`: quella si sincronizza, e la
 * chiave finirebbe sul server dentro `sync_records`, in chiaro. Sarebbe stata
 * la strada piu' corta e avrebbe rifatto lo stesso danno da un'altra parte.
 *
 * In memoria dopo l'avvio perche' `hasGroqKey()` viene chiamata anche in
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
