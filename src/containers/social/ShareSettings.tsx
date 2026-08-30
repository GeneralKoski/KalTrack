import * as social from "@/src/api/social";
import { Card, Chip } from "@/src/components/kal";
import { useAppTheme } from "@/src/components/ThemeContext";
import { Text, TextInput } from "@/src/components/ui";
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
 */
const KEYS = [
  ["calories", "shareCalories"],
  ["steps", "shareSteps"],
  ["weight", "shareWeight"],
  ["workouts", "shareWorkouts"],
  ["gym", "shareGym"],
] as const;

/** Le finestre pronte, piu' la possibilita' di scriverne una. */
const WINDOWS = [7, 30, 90] as const;

export const ShareSettings: React.FC = () => {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const profile = useAccountStore((s) => s.profile);
  const setProfile = useAccountStore((s) => s.setProfile);
  const [saving, setSaving] = useState<string | null>(null);
  /** Non null mentre si scrive una finestra a mano. */
  const [custom, setCustom] = useState<string | null>(null);

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

  const setWindow = async (giorni: number) => {
    const previous = profile;
    setProfile({
      ...profile,
      shares: { ...profile.shares, windowDays: giorni },
    });
    setSaving("window");
    try {
      setProfile(await social.updateMyProfile({ shareWindowDays: giorni }));
      // Allargando la finestra c'e' altro passato da pubblicare, e aspettare
      // il prossimo avvio dell'app farebbe sembrare che non sia successo
      // niente. Restringendola, il server ha gia' cancellato.
      if (giorni > (previous.shares.windowDays ?? 0)) void syncSharedStats();
    } catch (error) {
      logger.warn("[social] finestra non salvata", error);
      setProfile(previous);
      showToast.error({ title: t("social.share_failed") });
    } finally {
      setSaving(null);
    }
  };

  const finestra = profile.shares.windowDays;

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

      <Text style={[styles.label, { color: colors.text }]}>
        {t("social.share_window")}
      </Text>
      <View style={styles.chips}>
        {WINDOWS.map((giorni) => (
          <Chip
            key={giorni}
            label={t("social.window_days", { count: giorni })}
            active={finestra === giorni}
            onPress={() => void setWindow(giorni)}
          />
        ))}
        <Chip
          label={t("social.window_custom")}
          active={!WINDOWS.includes(finestra as (typeof WINDOWS)[number])}
          onPress={() => setCustom(String(finestra))}
        />
      </View>
      {custom !== null ? (
        <View style={styles.row}>
          <TextInput
            style={[
              styles.customInput,
              { color: colors.text, borderColor: colors.border },
            ]}
            value={custom}
            onChangeText={setCustom}
            keyboardType="number-pad"
            placeholder={t("social.window_custom_hint")}
            placeholderTextColor={colors.textFaint}
            onBlur={() => {
              const giorni = Number(custom);
              // Fuori dai limiti non si salva e non si azzera: il campo resta
              // com'e' scritto, e la finestra resta quella di prima. Un valore
              // rifiutato dal server non deve poter cambiare cosa esce.
              if (Number.isInteger(giorni) && giorni >= 1 && giorni <= 365) {
                void setWindow(giorni);
              }
              setCustom(null);
            }}
          />
        </View>
      ) : null}
      <Text style={[styles.hint, { color: colors.textMuted }]}>
        {t("social.share_window_hint")}
      </Text>
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
  chips: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.xs },
  customInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: theme.radius.sm,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    fontSize: 15,
  },
});
