import { setLanguageProvider } from "@/src/api/client";
import { i18n } from "@/src/i18n";
import { logger } from "@/src/utils/logger";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getLocales } from "expo-localization";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

// Italiano di default (rilevato dal dispositivo quando disponibile),
// altrimenti inglese. Aggiungere un'altra lingua vuol dire aggiungere il file
// in src/i18n/locales/, la voce qui sotto e quella in app.json >
// expo-localization > supportedLocales: nient'altro cambia.
export const SUPPORTED_LANGUAGES = ["it", "en"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

const FALLBACK_LANGUAGE: SupportedLanguage = "en";

const getDeviceLanguage = (): SupportedLanguage => {
  try {
    const locales = getLocales();
    const code = locales[0]?.languageCode ?? FALLBACK_LANGUAGE;

    if (SUPPORTED_LANGUAGES.includes(code as SupportedLanguage)) {
      return code as SupportedLanguage;
    }
  } catch (error) {
    logger.error("[i18n] Errore rilevamento lingua:", error);
  }
  return FALLBACK_LANGUAGE;
};

const deviceLanguage = getDeviceLanguage();
logger.info(`[i18n] Lingua dispositivo: ${deviceLanguage}`);

interface TranslationStore {
  language: SupportedLanguage;
  isReady: boolean;
  setLanguage: (lang: SupportedLanguage) => void;
  reset: () => void;
}

export const useTranslationStore = create<TranslationStore>()(
  persist(
    (set) => ({
      language: deviceLanguage,
      isReady: false,

      setLanguage: (lang) => {
        if (!SUPPORTED_LANGUAGES.includes(lang)) {
          return;
        }
        i18n.locale = lang;
        set({ language: lang });
      },

      reset: () => {
        i18n.locale = deviceLanguage;
        set({ language: deviceLanguage });
      },
    }),
    {
      name: "app_language",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ language: state.language }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          if (state.language !== deviceLanguage) {
            logger.info(
              `[i18n] Lingua sovrascritta: ${deviceLanguage} → ${state.language}`,
            );
          }
          i18n.locale = state.language;
          state.isReady = true;
        }
      },
    },
  ),
);

// Imposta la lingua iniziale (prima della reidratazione)
i18n.locale = useTranslationStore.getState().language;

// Il client legge la lingua da qui: cosi' non conosce lo store e lo store non
// conosce axios (stesso schema di `setAuthTokenProvider` in `accountStore`).
setLanguageProvider(() => useTranslationStore.getState().language);
