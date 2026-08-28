import { i18n } from "@/src/i18n";
import { useTranslationStore } from "@/src/stores/translationStore";
import { useCallback } from "react";

/**
 * Hook reattivo per le traduzioni.
 * Si aggiorna automaticamente quando la lingua cambia.
 *
 * @example
 * const { t, language, setLanguage } = useTranslation();
 * <Text>{t("save")}</Text>
 * <Text>{t("greeting", { name: "Marco" })}</Text>
 */
export function useTranslation() {
  const language = useTranslationStore((s) => s.language);
  const setLanguage = useTranslationStore((s) => s.setLanguage);

  // Wrappa i18n.t per garantire che React rilevi il cambio lingua
  // (la sottoscrizione a `language` sopra forza il re-render)
  const t = useCallback(
    (key: string, options?: Record<string, unknown>) => i18n.t(key, options),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [language],
  );

  return { t, language, setLanguage };
}
