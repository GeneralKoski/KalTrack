import { SettingsPage } from "@/src/containers/settings/SettingsPage";
import { LanguagePicker } from "@/src/containers/settings/LanguagePicker";
import { useTranslation } from "@/src/hooks/useTranslation";
import React from "react";

export function LanguageScreen() {
  const { t } = useTranslation();

  return (
    <SettingsPage title={t("settings.language")}>
      <LanguagePicker />
    </SettingsPage>
  );
}
