import { ScreenBackground, SectionLabel } from "@/src/components/kal";
import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import {
  sessionDetail,
  type SessionSetDetail,
} from "@/src/db/queries/workouts";
import { useAppNav } from "@/src/hooks/useAppNav";
import { useFocusData } from "@/src/hooks/useFocusData";
import { useTranslation } from "@/src/hooks/useTranslation";
import { theme } from "@/src/styles";
import { formatShortDate } from "@/src/utils/dateUtils";
import { useRoute, type RouteProp } from "@react-navigation/native";
import { ChevronLeft } from "lucide-react-native";
import React, { useCallback } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * Un allenamento passato, in sola lettura.
 *
 * Non e' `SessionScreen` con i campi spenti: quella registra dal vivo, prende
 * `{ routineId, dayIndex }` e non sa aprire una sessione per id. Qui non si
 * modifica e non si cancella - eliminare un allenamento resta la pressione
 * lunga sull'elenco, dove si scelgono anche a gruppi.
 *
 * Ci si arriva toccando una card di "Ultimi allenamenti", **compresa quella
 * ancora aperta**: mostra quel che ha registrato finora, e riprenderla resta
 * la card in cima alla pagina Palestra, cosi' i due gesti non si pestano.
 */
export function SessionDetailScreen() {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const { goBack } = useAppNav();
  const insets = useSafeAreaInsets();
  const route = useRoute<RouteProp<{ params: { id: string } }, "params">>();
  const id = route.params.id;

  const loader = useCallback(() => sessionDetail(id), [id]);
  const { data: session, loading } = useFocusData(loader);

  /** Una serie: "60 kg × 10 rip", o le sole ripetizioni a corpo libero. */
  const setLabel = (set: SessionSetDetail): string => {
    const reps = set.reps === null ? null : `${set.reps} ${t("gym.reps")}`;
    const weight =
      set.weight === null || set.weight === 0
        ? null
        : `${set.weight} ${t("gym.kg")}`;
    const parts = [weight, reps].filter((part) => part !== null);
    return parts.length > 0 ? parts.join(" × ") : "-";
  };

  const summary = (): string => {
    if (!session) return "";
    const parts = [
      formatShortDate(session.date),
      t("gym.sets_count", { count: session.workingSets }),
    ];
    if (session.volumeKg > 0) {
      parts.push(`${Math.round(session.volumeKg)} ${t("gym.kg")}`);
    }
    // La durata solo quando l'allenamento e' finito: su uno ancora aperto
    // sarebbe il tempo trascorso da quando e' cominciato, che non e' la stessa
    // cosa e cambierebbe a ogni apertura della schermata.
    if (session.startedAt && session.endedAt) {
      const minutes = Math.round(
        (Date.parse(session.endedAt) - Date.parse(session.startedAt)) / 60000,
      );
      if (minutes > 0) parts.push(t("gym.session_duration", { minutes }));
    }
    return parts.join(" · ");
  };

  return (
    <View style={styles.root}>
      <ScreenBackground />
      <SafeAreaView edges={["top", "left", "right"]} style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity onPress={goBack} activeOpacity={0.6} hitSlop={10}>
            <ChevronLeft size={26} color={colors.textSecondary} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
            {session?.dayName ?? t("gym.free_workout")}
          </Text>
        </View>

        {loading && !session ? (
          <ActivityIndicator style={styles.loader} color={colors.accent} />
        ) : !session ? (
          <Text style={[styles.hint, { color: colors.textMuted }]}>
            {t("gym.session_not_found")}
          </Text>
        ) : (
          <ScrollView
            contentContainerStyle={[
              styles.content,
              { paddingBottom: insets.bottom + theme.spacing.lg },
            ]}
            showsVerticalScrollIndicator={false}
          >
            <Text style={[styles.summary, { color: colors.textMuted }]}>
              {summary()}
            </Text>

            {session.exercises.length === 0 ? (
              <Text style={[styles.hint, { color: colors.textMuted }]}>
                {t("gym.session_no_sets")}
              </Text>
            ) : (
              session.exercises.map((exercise) => (
                <View key={exercise.exerciseId} style={styles.exercise}>
                  <SectionLabel>{exercise.name}</SectionLabel>
                  {exercise.sets.map((set, index) => (
                    <View key={index} style={styles.setRow}>
                      <View
                        style={[
                          styles.badge,
                          { backgroundColor: colors.surfaceMuted },
                        ]}
                      >
                        <Text
                          style={[styles.badgeText, { color: colors.textMuted }]}
                        >
                          {index + 1}
                        </Text>
                      </View>
                      <Text style={[styles.setValue, { color: colors.text }]}>
                        {setLabel(set)}
                      </Text>
                      {set.isWarmup ? (
                        <Text
                          style={[styles.setTag, { color: colors.textMuted }]}
                        >
                          {t("gym.warmup")}
                        </Text>
                      ) : null}
                      {set.rpe !== null ? (
                        <Text
                          style={[styles.setTag, { color: colors.textMuted }]}
                        >
                          RPE {set.rpe}
                        </Text>
                      ) : null}
                    </View>
                  ))}
                </View>
              ))
            )}

            {session.notes ? (
              <>
                <SectionLabel style={styles.notesLabel}>
                  {t("gym.session_notes")}
                </SectionLabel>
                <Text style={[styles.notes, { color: colors.text }]}>
                  {session.notes}
                </Text>
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
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  title: { flex: 1, fontSize: 20, fontWeight: "700" },
  loader: { marginTop: theme.spacing.xl },
  content: { paddingHorizontal: theme.spacing.md },
  summary: { fontSize: 13, marginBottom: theme.spacing.md },
  hint: {
    fontSize: 14,
    paddingHorizontal: theme.spacing.md,
    marginTop: theme.spacing.md,
  },
  exercise: { marginBottom: theme.spacing.md },
  setRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    paddingVertical: 6,
  },
  badge: {
    width: 24,
    height: 24,
    borderRadius: theme.radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { fontSize: 12, fontWeight: "600" },
  setValue: { fontSize: 15, fontWeight: "600" },
  setTag: { fontSize: 12 },
  notesLabel: { marginTop: theme.spacing.sm },
  notes: { fontSize: 14, lineHeight: 20 },
});
