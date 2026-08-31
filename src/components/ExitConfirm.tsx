import React, { useEffect, useState } from "react";
import { BackHandler } from "react-native";

import { DfAlert } from "@/src/components/DfAlert";
import { useTranslation } from "@/src/hooks/useTranslation";
import { navigationRef } from "@/src/navigation/navigationRef";

// Intercetta il tasto "indietro" hardware di Android quando non c'è più nulla
// su cui tornare: invece di chiudere l'app di colpo chiede conferma con DfAlert.
// Su iOS BackHandler non emette mai eventi (nessun tasto back di sistema), quindi
// il componente è di fatto un no-op lì.
export function ExitConfirm() {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const onBackPress = () => {
      if (navigationRef.isReady() && navigationRef.canGoBack()) {
        return false;
      }
      setIsOpen(true);
      return true;
    };

    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      onBackPress,
    );
    return () => subscription.remove();
  }, []);

  return (
    <DfAlert
      isOpen={isOpen}
      title={t("exit_app_title")}
      message={t("exit_app_message")}
      confirmLabel={t("exit_app_confirm")}
      cancelLabel={t("cancel")}
      onConfirm={() => {
        setIsOpen(false);
        BackHandler.exitApp();
      }}
      onClose={() => setIsOpen(false)}
    />
  );
}
