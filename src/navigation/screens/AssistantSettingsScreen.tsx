import { AiKeySettings } from "@/src/containers/settings/AiKeySettings";
import { AssistantSettings } from "@/src/containers/settings/AssistantSettings";
import { SettingsPage } from "@/src/containers/settings/SettingsPage";
import { useTranslation } from "@/src/hooks/useTranslation";
import { useRoute, type RouteProp } from "@react-navigation/native";
import React from "react";

/**
 * L'assistente: la voce, i tool auto-confermati e la chiave.
 *
 * `AiKeySettings` era montata da nessuna parte: chi arrivava qui da "serve la
 * chiave AI" trovava le impostazioni e nessun campo dove metterla. Ci arriva
 * con `focus: "aiKey"`, e in quel caso il cursore parte nel campo.
 */
export function AssistantSettingsScreen() {
  const { t } = useTranslation();
  const route =
    useRoute<RouteProp<{ params: { focus?: "aiKey" } }, "params">>();

  return (
    <SettingsPage title={t("settings.assistant")}>
      <AssistantSettings />
      <AiKeySettings autoFocus={route.params?.focus === "aiKey"} />
    </SettingsPage>
  );
}
