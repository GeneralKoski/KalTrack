import { DfAlert } from "@/src/components/DfAlert";
import { useTranslation } from "@/src/hooks/useTranslation";
import React from "react";

interface AiKeyPromptProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Cosa succede quando si chiede all'AI qualcosa e la chiave non c'e'.
 *
 * La chiave e' una sola e sta nel bundle (`EXPO_PUBLIC_GEMINI_API_KEY`), quindi
 * mancante vuol dire una cosa sola: questa build e' stata fatta senza `.env`.
 * Non c'e' piu' un campo dove metterla - c'e' stato fino al 3 settembre 2026 -
 * e quindi non c'e' piu' un pulsante che ci porti: resta da dire che l'AI in
 * questa copia dell'app non funziona, che e' meglio di un tasto che non fa
 * niente.
 */
export const AiKeyPrompt: React.FC<AiKeyPromptProps> = ({
  isOpen,
  onClose,
}) => {
  const { t } = useTranslation();

  return (
    <DfAlert
      isOpen={isOpen}
      title={t("ai_key.missing_title")}
      message={t("ai_key.missing_message")}
      confirmLabel={t("close")}
      hideCancel
      onConfirm={onClose}
      onClose={onClose}
    />
  );
};
