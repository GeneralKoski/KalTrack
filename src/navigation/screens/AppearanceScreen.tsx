import { SettingsPage } from "@/src/containers/settings/SettingsPage";
import { ThemePicker } from "@/src/containers/settings/ThemePicker";
import { useTranslation } from "@/src/hooks/useTranslation";
import React from "react";

export function AppearanceScreen() {
  const { t } = useTranslation();

  return (
    <SettingsPage title={t("settings.theme")}>
      <ThemePicker />
    </SettingsPage>
  );
}
