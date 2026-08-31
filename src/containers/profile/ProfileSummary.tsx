import { DfButton } from "@/src/components/form/DfButton";
import { Card } from "@/src/components/kal";
import { Avatar } from "@/src/components/kal/Avatar";
import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import { collectStats } from "@/src/db/queries/achievements";
import { dailyKcalRange } from "@/src/db/queries/diary";
import { latestWeight } from "@/src/db/queries/tracking";
import { sessionCountInRange } from "@/src/db/queries/workouts";
import { currentStreak } from "@/src/domain/achievements";
import { addDays, startOfWeek, todayIso } from "@/src/domain/date";
import { average } from "@/src/domain/stats";
import { useAppNav } from "@/src/hooks/useAppNav";
import { useFocusData } from "@/src/hooks/useFocusData";
import { useTranslation } from "@/src/hooks/useTranslation";
import { useAccountStore } from "@/src/stores/accountStore";
import { theme } from "@/src/styles";
import React, { useCallback } from "react";
import { StyleSheet, View } from "react-native";

interface Summary {
  weightKg: number | null;
  streak: number;
  workouts: number;
  avgKcal: number | null;
}

/** La media delle calorie guarda una settimana: meno è umore, più è storia. */
const AVERAGE_DAYS = 7;

/**
 * Chi sei e come stai andando, in cima al profilo.
 *
 * Prima questa schermata era tredici righe tutte uguali e non diceva niente di
 * chi la stava guardando: il proprio nome e i propri numeri stavano altrove,
 * in una schermata che si chiamava "Il mio account".
 *
 * I quattro numeri sono scelti per rispondere a "come sto andando" e non per
 * riempire: il peso di oggi, da quanti giorni non si salta un giorno, quanti
 * allenamenti in questa settimana, quanto si mangia in media. Un numero che
 * non c'è è un trattino e non uno zero - zero chilogrammi e "non mi sono mai
 * pesato" non sono la stessa cosa.
 */
export const ProfileSummary: React.FC = () => {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const { navigate } = useAppNav();
  const account = useAccountStore((s) => s.profile);

  const loader = useCallback(async (): Promise<Summary> => {
    const today = todayIso();
    const [weight, stats, workouts, kcal] = await Promise.all([
      latestWeight(),
      collectStats(),
      sessionCountInRange(startOfWeek(today), today),
      dailyKcalRange(addDays(today, -(AVERAGE_DAYS - 1)), today),
    ]);

    return {
      weightKg: weight?.weight_kg ?? null,
      streak: currentStreak(stats.loggedDates, today),
      workouts,
      // La media sui giorni REGISTRATI, non su sette: chi ha scritto due
      // giorni su sette non mangia in media seicento calorie.
      avgKcal: average(kcal.map((d) => d.kcal)),
    };
  }, []);

  const { data } = useFocusData<Summary>(loader);

  const stat = (label: string, value: string) => (
    <View style={styles.stat}>
      <Text style={[styles.statValue, { color: colors.text }]} numberOfLines={1}>
        {value}
      </Text>
      <Text
        style={[styles.statLabel, { color: colors.textMuted }]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );

  const numero = (value: number | null, decimals = 0): string =>
    value === null ? "–" : value.toLocaleString("it-IT", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });

  return (
    <Card style={styles.card}>
      <View style={styles.identity}>
        <Avatar
          size={56}
          name={account?.displayName}
          photoUri={account?.avatarUrl ?? undefined}
        />
        <View style={styles.names}>
          <Text
            style={[styles.name, { color: colors.text }]}
            numberOfLines={1}
          >
            {account?.displayName ?? t("profile.no_account")}
          </Text>
          <Text
            style={[styles.handle, { color: colors.textMuted }]}
            numberOfLines={1}
          >
            {account ? `@${account.handle}` : t("profile.no_account_hint")}
          </Text>
        </View>
      </View>

      {account?.bio?.trim() ? (
        <Text
          style={[styles.bio, { color: colors.textSecondary }]}
          numberOfLines={3}
        >
          {account.bio}
        </Text>
      ) : null}

      <View style={[styles.stats, { borderTopColor: colors.border }]}>
        {stat(
          t("profile.stat_weight"),
          data?.weightKg == null ? "–" : `${numero(data.weightKg, 1)} kg`,
        )}
        {stat(t("profile.stat_streak"), `${data?.streak ?? 0}`)}
        {stat(t("profile.stat_workouts"), `${data?.workouts ?? 0}`)}
        {stat(
          t("profile.stat_kcal"),
          data?.avgKcal == null ? "–" : numero(Math.round(data.avgKcal)),
        )}
      </View>

      {/*
        L'account si gestisce da qui: è la stessa persona di cui sopra si
        vedono nome e foto, e cercarlo fra le impostazioni non lo era. Senza
        account si va agli amici, che è la schermata dove si entra: "Il mio
        account" mostrerebbe un caricamento che non finisce mai.
      */}
      <DfButton
        label={account ? t("social.my_profile") : t("profile.sign_in")}
        variant="outlined"
        fullWidth={false}
        onPress={() => navigate(account ? "MyProfile" : "Friends")}
        style={styles.accountButton}
      />
    </Card>
  );
};

const styles = StyleSheet.create({
  card: { gap: theme.spacing.sm },
  identity: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  names: { flex: 1 },
  name: { fontSize: 18, fontWeight: "700" },
  handle: { fontSize: 13 },
  bio: { fontSize: 13, lineHeight: 18 },
  stats: {
    flexDirection: "row",
    borderTopWidth: 1,
    paddingTop: theme.spacing.sm,
    gap: theme.spacing.xs,
  },
  stat: { flex: 1, alignItems: "center", gap: 2 },
  statValue: { fontSize: 16, fontWeight: "700" },
  statLabel: { fontSize: 11, textAlign: "center" },
  /* Un bordo e non solo il testo: l'interattivo qui è quasi nero come il
     testo normale, e senza contorno "Il mio account" si legge come un titolo. */
  accountButton: { alignSelf: "flex-start" },
});
