import * as social from "@/src/api/social";
import { ASSISTANT_FAB_CLEARANCE } from "@/src/containers/assistant/AssistantButton";
import { Card, EmptyState, ScreenBackground, SectionLabel } from "@/src/components/kal";
import { FriendComparison } from "@/src/containers/social/FriendComparison";
import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import { useAppNav } from "@/src/hooks/useAppNav";
import { useFocusData } from "@/src/hooks/useFocusData";
import { useTranslation } from "@/src/hooks/useTranslation";
import { theme } from "@/src/styles";
import { formatDate } from "@/src/utils/dateUtils";
import { useRoute, type RouteProp } from "@react-navigation/native";
import { ChevronLeft, Lock } from "lucide-react-native";
import React, { useCallback } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

/** Un numero non condiviso si scrive con un trattino, non con uno zero. */
const value = (n: number | null, unit: string): string =>
  n === null ? "—" : `${n.toLocaleString("it-IT")}${unit ? ` ${unit}` : ""}`;

/**
 * Il profilo di qualcun altro.
 *
 * Mostra soltanto quel che il server ha mandato, che e' gia' filtrato due
 * volte: dalle scelte del proprietario e dall'amicizia. Qui non si decide
 * niente sulla privacy, si disegna: se un domani il server mandasse un campo
 * di troppo, questa schermata lo mostrerebbe, ed e' per questo che il
 * controllo sta li' e non qui.
 */
export function FriendProfileScreen() {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { goBack } = useAppNav();
  const route = useRoute<RouteProp<{ params: { handle: string } }, "params">>();
  const handle = route.params.handle;

  const loader = useCallback(() => social.fetchProfile(handle), [handle]);
  const { data, loading } = useFocusData<social.PublicProfile>(loader);

  const rows: { key: string; label: string; text: string }[] = [];
  const last = data?.stats[0];
  if (last) {
    if (data?.shares.calories) {
      rows.push({ key: "kcal", label: t("social.share_calories"), text: value(last.kcal, "kcal") });
    }
    if (data?.shares.steps) {
      rows.push({ key: "steps", label: t("social.share_steps"), text: value(last.steps, t("tracking.steps_unit")) });
    }
    if (data?.shares.weight) {
      rows.push({ key: "weight", label: t("social.share_weight"), text: value(last.weightKg, "kg") });
    }
    if (data?.shares.workouts) {
      rows.push({ key: "workouts", label: t("social.share_workouts"), text: value(last.workouts, "") });
    }
  }

  return (
    <View style={styles.root}>
      <ScreenBackground />
      <SafeAreaView edges={["top", "left", "right"]} style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity onPress={goBack} activeOpacity={0.6} hitSlop={10}>
            <ChevronLeft size={26} color={colors.textSecondary} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
            {data?.displayName ?? `@${handle}`}
          </Text>
        </View>

        {loading && !data ? (
          <ActivityIndicator style={styles.loader} color={colors.accent} />
        ) : (
          <ScrollView
            contentContainerStyle={[
              styles.content,
              { paddingBottom: insets.bottom + ASSISTANT_FAB_CLEARANCE },
            ]}
            showsVerticalScrollIndicator={false}
          >
            <Card style={styles.card}>
              <Text style={[styles.handle, { color: colors.textMuted }]}>
                @{data?.handle ?? handle}
              </Text>
              {data?.bio ? (
                <Text style={[styles.bio, { color: colors.text }]}>{data.bio}</Text>
              ) : null}
            </Card>

            {data && !data.isFriend ? (
              // Non e' un errore ne' un profilo vuoto: e' una porta chiusa, e
              // va detto con le parole giuste invece di mostrare zeri.
              <EmptyState
                message={t("social.not_friend_yet")}
                icon={<Lock size={40} color={colors.textFaint} />}
              />
            ) : null}

            {data?.isFriend ? (
              <>
                <SectionLabel style={styles.section}>
                  {last ? formatDate(last.date) : t("social.latest")}
                </SectionLabel>
                {rows.length === 0 ? (
                  <Text style={[styles.hint, { color: colors.textMuted }]}>
                    {t("social.shares_nothing")}
                  </Text>
                ) : (
                  <Card style={styles.card}>
                    {rows.map((row) => (
                      <View key={row.key} style={styles.statRow}>
                        <Text style={[styles.statLabel, { color: colors.textMuted }]} numberOfLines={1}>
                          {row.label}
                        </Text>
                        <Text style={[styles.statValue, { color: colors.text }]}>
                          {row.text}
                        </Text>
                      </View>
                    ))}
                  </Card>
                )}

                {last ? (
                  <FriendComparison
                    date={last.date}
                    theirs={{
                      kcal: last.kcal,
                      steps: last.steps,
                      workouts: last.workouts,
                    }}
                    shares={{
                      calories: data.shares.calories,
                      steps: data.shares.steps,
                      workouts: data.shares.workouts,
                    }}
                  />
                ) : null}

                {data.stats.length > 1 ? (
                  <>
                    <SectionLabel style={styles.section}>
                      {t("social.history")}
                    </SectionLabel>
                    {data.stats.slice(1).map((day) => (
                      <Card key={day.date} style={styles.dayRow}>
                        <Text style={[styles.dayDate, { color: colors.text }]} numberOfLines={1}>
                          {formatDate(day.date)}
                        </Text>
                        <Text style={[styles.dayMeta, { color: colors.textMuted }]} numberOfLines={1}>
                          {[
                            data.shares.calories ? value(day.kcal, "kcal") : null,
                            data.shares.steps
                              ? value(day.steps, t("tracking.steps_unit"))
                              : null,
                            data.shares.weight ? value(day.weightKg, "kg") : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </Text>
                      </Card>
                    ))}
                  </>
                ) : null}
              </>
            ) : null}
          </ScrollView>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  title: { flex: 1, fontSize: 24, fontWeight: "700" },
  content: { padding: theme.spacing.md, gap: theme.spacing.sm },
  loader: { marginTop: theme.spacing.xl },
  card: { gap: theme.spacing.xs },
  handle: { fontSize: 14 },
  bio: { fontSize: 15, lineHeight: 21 },
  section: { marginTop: theme.spacing.md },
  hint: { fontSize: 13, lineHeight: 18 },
  statRow: { flexDirection: "row", alignItems: "center", gap: theme.spacing.sm },
  statLabel: { flex: 1, fontSize: 14 },
  statValue: { fontSize: 16, fontWeight: "700" },
  dayRow: { flexDirection: "row", alignItems: "center", gap: theme.spacing.sm },
  dayDate: { flex: 1, fontSize: 14, fontWeight: "600" },
  dayMeta: { fontSize: 13 },
});
