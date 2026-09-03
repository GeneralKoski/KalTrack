import { AdminPasswordReset } from "@/src/containers/settings/AdminPasswordReset";
import { SettingsPage } from "@/src/containers/settings/SettingsPage";
import { useTranslation } from "@/src/hooks/useTranslation";
import React from "react";

export function AdminScreen() {
  const { t } = useTranslation();

  return (
    <SettingsPage title={t("admin.title")}>
      <AdminPasswordReset />
    </SettingsPage>
  );
}
