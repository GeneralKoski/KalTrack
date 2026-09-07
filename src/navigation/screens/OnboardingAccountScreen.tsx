import {
  OnboardingShell,
  OnboardingTitle,
} from "@/src/containers/onboarding/OnboardingShell";
import { AccountForm } from "@/src/containers/social/AccountForm";
import { resetToTabs, useAppNav } from "@/src/hooks/useAppNav";
import { useTranslation } from "@/src/hooks/useTranslation";
import { useAccountStore } from "@/src/stores/accountStore";
import { useOnboardingStore } from "@/src/stores/onboardingStore";
import React, { useEffect, useRef } from "react";

/**
 * Ultimo passo: l'account, che si può non fare.
 *
 * Era il SECONDO, cioè un modulo di registrazione prima ancora di aver visto
 * l'app - e con "Salta per ora", la via che quasi tutti prendono, come bottone
 * più lontano dello schermo. Qui l'ordine è quello vero: si arriva a fine
 * wizard, si sa cosa fa l'app, e chi non vuole un account preme il bottone in
 * fondo ed entra.
 *
 * **La spiegazione non si scrive qui**: `AccountForm` ne porta già una, e
 * scrivendone una seconda sopra la stessa cosa era detta due volte di fila,
 * con parole diverse. Quella del modulo è la più completa e la vedono anche
 * Profilo e Impostazioni: una sola, in un posto solo.
 */
export function OnboardingAccountScreen() {
  const { t } = useTranslation();
  const { goBack } = useAppNav();
  const complete = useOnboardingStore((s) => s.complete);
  const token = useAccountStore((s) => s.token);
  const hadToken = useRef(token !== null);

  const finish = async () => {
    await complete();
    resetToTabs();
  };

  useEffect(() => {
    // Solo la TRANSIZIONE ad "accesso riuscito" chiude il wizard: se il token
    // c'era già all'apertura (si rientra dopo un abbandono), uscire da soli
    // sorprenderebbe chi sta ancora leggendo.
    if (!hadToken.current && token !== null) void finish();
    hadToken.current = token !== null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <OnboardingShell
      step="OnboardingAccount"
      onBack={goBack}
      primaryLabel={t("onboarding.start_without_account")}
      primaryVariant="outlined"
      onPrimary={() => void finish()}
    >
      <OnboardingTitle>{t("onboarding.account_title")}</OnboardingTitle>
      <AccountForm />
    </OnboardingShell>
  );
}
