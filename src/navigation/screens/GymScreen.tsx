import { ASSISTANT_FAB_CLEARANCE } from "@/src/containers/assistant/AssistantButton";
import { DfButton } from "@/src/components/form/DfButton";
import { Card, EmptyState, ScreenBackground, SectionLabel } from "@/src/components/kal";
import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import {
  getActiveRoutine,
  listRoutineDays,
  recentSessions,
  type RecentSession,
} from "@/src/db/queries/workouts";
import { useAppNav } from "@/src/hooks/useAppNav";
import { useFocusData } from "@/src/hooks/useFocusData";
import { useTranslation } from "@/src/hooks/useTranslation";
import { theme } from "@/src/styles";
import type { RoutineDayRow, RoutineRow } from "@/src/types/gym";
import { useNavigation } from "@react-navigation/native";
import {
  ChevronRight,
  ClipboardList,
  Dumbbell,
  Play,
  Settings2,
} from "lucide-react-native";
import React, { useCallback } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

interface GymData {
  routine: RoutineRow | null;
  days: RoutineDayRow[];
  sessions: RecentSession[];
}

/** Data ISO -> "gio 28 ago", per riconoscere l'allenamento a colpo d'occhio. */
const shortDate = (iso: string): string => {
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return iso;
  return new Date(year, month - 1, day).toLocaleDateString("it-IT", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
};

/**
 * La schermata della palestra: da qui si comincia ad allenarsi.
 *
 * Mostra i giorni della scheda attiva perche' quello e' il gesto quotidiano -
 * apro, tocco il giorno, alleno - e sotto gli ultimi allenamenti, che sono la
 * risposta alla domanda "quando ho fatto gambe l'ultima volta?".
 */
export function GymScreen() {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { navigate } = useAppNav();
  const navigation = useNavigation();
  // Le schede sono registrate nello stack ma prendono parametri diversi da
  // quelli del tipo di useAppNav: qui serve l'API non tipizzata.
  const openRoutines = navigation.navigate as unknown as (
    name: string,
    params?: object,
  ) => void;

  const loader = useCallback(async (): Promise<GymData> => {
    const routine = await getActiveRoutine();
    const [days, sessions] = await Promise.all([
      routine ? listRoutineDays(routine.id) : Promise.resolve([]),
      recentSessions(),
    ]);
    return { routine, days, sessions };
  }, []);

  const { data, loading } = useFocusData<GymData>(loader);

  // Una sessione senza fine e' aperta: si riprende, non se ne apre un'altra.
  const open = data?.sessions.find((s) => s.endedAt === null) ?? null;

  return (
    <View style={styles.root}>
      <ScreenBackground />
      <SafeAreaView edges={["top", "left", "right"]} style={styles.safe}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
            {t("tabs.gym")}
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
            {open ? (
              <Card style={styles.openCard}>
                <Text style={[styles.openTitle, { color: colors.text }]}>
                  {t("gym.session_open")}
                </Text>
                <Text style={[styles.openMeta, { color: colors.textMuted }]}>
                  {open.dayName ?? t("gym.free_workout")} - {shortDate(open.date)}
                </Text>
              </Card>
            ) : null}

            <SectionLabel>{t("gym.active_routine")}</SectionLabel>

            {data?.routine ? (
              <>
                <Text style={[styles.routineName, { color: colors.text }]} numberOfLines={1}>
                  {data.routine.name}
                </Text>
                {data.days.map((day, index) => (
                  <Card
                    key={day.id}
                    onPress={() =>
                      navigate("Session", {
                        routineId: data.routine?.id ?? "",
                        dayIndex: index,
                      })
                    }
                    style={styles.dayRow}
                  >
                    <Play size={20} color={colors.text} />
                    <Text
                      style={[styles.dayName, { color: colors.text }]}
                      numberOfLines={1}
                    >
                      {day.name}
                    </Text>
                    <ChevronRight size={20} color={colors.textFaint} />
                  </Card>
                ))}
                {data.days.length === 0 ? (
                  <Text style={[styles.hint, { color: colors.textMuted }]}>
                    {t("gym.routine_without_days")}
                  </Text>
                ) : null}
              </>
            ) : (
              <View style={styles.empty}>
                <EmptyState
                  message={t("gym.no_active_routine")}
                  icon={<ClipboardList size={40} color={colors.textFaint} />}
                />
                <DfButton
                  label={t("gym.routines")}
                  icon={<Dumbbell size={18} color={colors.text} />}
                  onPress={() => openRoutines("Routines")}
                />
              </View>
            )}

            <SectionLabel style={styles.section}>
              {t("gym.recent_sessions")}
            </SectionLabel>

            {data && data.sessions.length > 0 ? (
              data.sessions.map((session) => (
                <Card key={session.id} style={styles.sessionRow}>
                  <View style={styles.sessionText}>
                    <Text
                      style={[styles.sessionName, { color: colors.text }]}
                      numberOfLines={1}
                    >
                      {session.dayName ?? t("gym.free_workout")}
                    </Text>
                    <Text
                      style={[styles.sessionMeta, { color: colors.textMuted }]}
                      numberOfLines={1}
                    >
                      {shortDate(session.date)} - {t("gym.sets_count", {
                        count: session.workingSets,
                      })}
                      {session.volumeKg > 0
                        ? ` - ${Math.round(session.volumeKg).toLocaleString("it-IT")} kg`
                        : ""}
                    </Text>
                  </View>
                </Card>
              ))
            ) : (
              <Text style={[styles.hint, { color: colors.textMuted }]}>
                {t("gym.no_sessions")}
              </Text>
            )}

            {/* In fondo perche' sono le mete di secondo livello: il gesto
                quotidiano e' toccare il giorno di scheda qui sopra. */}
            <View style={[styles.links, styles.section]}>
              {data?.routine ? (
                <DfButton
                  label={t("gym.routines")}
                  variant="outlined"
                  fullWidth={false}
                  icon={<Dumbbell size={18} color={colors.accent} />}
                  onPress={() => openRoutines("Routines")}
                  style={styles.link}
                />
              ) : null}
              <DfButton
                label={t("gym.exercises")}
                variant="outlined"
                fullWidth={false}
                icon={<Settings2 size={18} color={colors.accent} />}
                onPress={() => navigate("Exercises")}
                style={styles.link}
              />
            </View>
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
  openCard: { gap: 2, marginBottom: theme.spacing.sm },
  openTitle: { fontSize: 15, fontWeight: "700" },
  openMeta: { fontSize: 13 },
  routineName: { fontSize: 16, fontWeight: "600" },
  dayRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  dayName: { flex: 1, fontSize: 15, fontWeight: "500" },
  sessionRow: { flexDirection: "row", alignItems: "center" },
  sessionText: { flex: 1, gap: 2 },
  sessionName: { fontSize: 15, fontWeight: "600" },
  sessionMeta: { fontSize: 13 },
  hint: { fontSize: 13, lineHeight: 18 },
  empty: { gap: theme.spacing.sm },
  links: { flexDirection: "row", gap: theme.spacing.sm },
  link: { flexGrow: 1, flexBasis: 0 },
  section: { marginTop: theme.spacing.md },
});
