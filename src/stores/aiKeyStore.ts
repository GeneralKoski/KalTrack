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
const KEY_STORAGE = "kaltrack_groq_key";

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
      const key = await SecureStore.getItemAsync(KEY_STORAGE);
      set({ key, isHydrated: true });
    } catch (error) {
      logger.error("[ai] lettura della chiave fallita", error);
      set({ isHydrated: true });
    }
  },

  save: async (key) => {
    const pulita = key.trim();
    await SecureStore.setItemAsync(KEY_STORAGE, pulita);
    set({ key: pulita });
  },

  clear: async () => {
    await SecureStore.deleteItemAsync(KEY_STORAGE);
    set({ key: null });
  },
}));
