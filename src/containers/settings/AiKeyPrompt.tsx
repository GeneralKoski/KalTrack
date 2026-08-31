import { DfAlert } from "@/src/components/DfAlert";
import { useAppNav } from "@/src/hooks/useAppNav";
import { useTranslation } from "@/src/hooks/useTranslation";
import React from "react";

interface AiKeyPromptProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Cosa succede quando si chiede all'AI qualcosa senza avere la chiave.
 *
 * Prima era una riga di testo spenta al posto dei pulsanti: diceva che serviva
 * la configurazione e lasciava all'utente il compito di indovinare dove.
 * Questa invece porta dritti al campo, che e' l'unica cosa che chi legge
 * quel messaggio vuole fare.
 */
export const AiKeyPrompt: React.FC<AiKeyPromptProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation();
  const { navigate } = useAppNav();

  return (
    <DfAlert
      isOpen={isOpen}
      title={t("ai_key.missing_title")}
      message={t("ai_key.missing_message")}
      confirmLabel={t("ai_key.missing_cta")}
      onConfirm={() => {
        onClose();
        navigate("Settings", { focus: "aiKey" });
      }}
      onClose={onClose}
    />
  );
};
