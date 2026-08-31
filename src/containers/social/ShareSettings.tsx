import * as social from "@/src/api/social";
import { Card } from "@/src/components/kal";
import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import { useTranslation } from "@/src/hooks/useTranslation";
import { syncSharedStats } from "@/src/services/shareSync";
import { useAccountStore } from "@/src/stores/accountStore";
import { theme } from "@/src/styles";
import { logger } from "@/src/utils/logger";
import { showToast } from "@/src/utils/toast";
import React, { useState } from "react";
import { StyleSheet, Switch, View } from "react-native";

/**
 * Cosa vedono gli amici.
 *
 * Cinque interruttori, tutti spenti finche' non li si accende: il profilo
 * appena creato non mostra niente, e questa e' la schermata dove si sceglie
 * cosa mostrare, non dove si scopre cosa si stava gia' mostrando.
 *
 * LA PALESTRA E' DIVERSA DALLE ALTRE QUATTRO e ha un testo suo sotto
 * l'interruttore. Gli altri fanno uscire un totale - un numero di calorie, di
 * passi - mentre questo fa uscire il CONTENUTO di un allenamento: quali
 * esercizi, con che carico. Chi lo accende deve saperlo prima, non scoprirlo
 * dopo, e "Palestra" da solo non lo dice.
 *
 * Il cambio parte subito e si annulla da solo se il server rifiuta: aspettare
 * la risposta prima di muovere l'interruttore fa sembrare l'app rotta su una
 * rete lenta, ma lasciarlo acceso dopo un errore sarebbe peggio, perche'
 * direbbe che si sta condividendo qualcosa che non si sta condividendo.
 *
 * Non c'e' piu' una finestra di giorni da scegliere: si pubblica tutto lo
 * storico. Sceglierne l'ampiezza era un'impostazione in piu' su una domanda
 * che nessuno si e' mai posto, e intanto tagliava il confronto a una
 * settimana.
 */
const KEYS = [
  ["calories", "shareCalories"],
  ["steps", "shareSteps"],
  ["weight", "shareWeight"],
  ["workouts", "shareWorkouts"],
  ["gym", "shareGym"],
] as const;

export const ShareSettings: React.FC = () => {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const profile = useAccountStore((s) => s.profile);
  const setProfile = useAccountStore((s) => s.setProfile);
  const [saving, setSaving] = useState<string | null>(null);

  if (!profile) return null;

  const toggle = async (
    key: (typeof KEYS)[number][0],
    field: (typeof KEYS)[number][1],
    next: boolean,
  ) => {
    const previous = profile;
    setProfile({ ...profile, shares: { ...profile.shares, [key]: next } });
    setSaving(key);
    try {
      setProfile(await social.updateMyProfile({ [field]: next }));
      /*
       * Pubblica subito quel che si e' appena acceso.
       *
       * Prima la pubblicazione partiva solo all'avvio dell'app: chi accendeva
       * la palestra andava a guardare il confronto e non trovava niente, il
       * che sembra un difetto e invece era solo attesa. Spegnendo non serve -
       * a cancellare ci pensa il server nel momento in cui riceve il PATCH.
       */
      if (next) void syncSharedStats();
    } catch (error) {
      logger.warn("[social] condivisione non salvata", error);
      setProfile(previous);
      showToast.error({ title: t("social.share_failed") });
    } finally {
      setSaving(null);
    }
  };

  return (
    <Card style={styles.card}>
      <Text style={[styles.hint, { color: colors.textMuted }]}>
        {t("social.shares_hint")}
      </Text>
      {KEYS.map(([key, field]) => (
        <View key={key}>
          <View style={styles.row}>
            <Text
              style={[styles.label, { color: colors.text }]}
              numberOfLines={1}
            >
              {t(`social.share_${key}`)}
            </Text>
            <Switch
              value={profile.shares[key]}
              disabled={saving === key}
              onValueChange={(next) => void toggle(key, field, next)}
            />
          </View>
          {/*
            Solo la palestra ha una spiegazione, e solo perche' e' l'unica che
            cambia il genere di cosa che esce. Metterla sotto tutti gli
            interruttori la farebbe leggere a nessuno.
          */}
          {key === "gym" ? (
            <Text style={[styles.rowHint, { color: colors.textMuted }]}>
              {t("social.share_gym_hint")}
            </Text>
          ) : null}
        </View>
      ))}
    </Card>
  );
};

const styles = StyleSheet.create({
  card: { gap: theme.spacing.sm },
  hint: { fontSize: 13, lineHeight: 18 },
  rowHint: { fontSize: 12, lineHeight: 17, marginTop: 2 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  label: { flex: 1, fontSize: 15, fontWeight: "500" },
});
