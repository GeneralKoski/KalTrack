import { HealthConnectSettings } from "@/src/containers/settings/HealthConnectSettings";
import { SettingsPage } from "@/src/containers/settings/SettingsPage";
import { useTranslation } from "@/src/hooks/useTranslation";
import React from "react";

export function HealthScreen() {
  const { t } = useTranslation();

  return (
    <SettingsPage title={t("settings.health")}>
      <HealthConnectSettings />
    </SettingsPage>
  );
}
