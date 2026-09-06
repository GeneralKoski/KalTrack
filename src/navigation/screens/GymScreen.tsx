import { DfAlert } from "@/src/components/DfAlert";
import { DfButton } from "@/src/components/form/DfButton";
import { Card, EmptyState, ScreenBackground, SectionLabel } from "@/src/components/kal";
import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import {
  deleteSession,
  getActiveRoutine,
  listRoutineDays,
  openSession,
  recentSessions,
  type RecentSession,
} from "@/src/db/queries/workouts";
import { useAppNav } from "@/src/hooks/useAppNav";
import { useFocusData } from "@/src/hooks/useFocusData";
import { useTranslation } from "@/src/hooks/useTranslation";
import { theme } from "@/src/styles";
import { formatShortDate } from "@/src/utils/dateUtils";
import type { RoutineDayRow, RoutineRow } from "@/src/types/gym";
import { logger } from "@/src/utils/logger";
import { showToast } from "@/src/utils/toast";
import { useNavigation } from "@react-navigation/native";
import {
  Check,
  ChevronRight,
  ClipboardList,
  Dumbbell,
  Play,
  Trash2,
  X,
} from "lucide-react-native";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

interface GymData {
  routine: RoutineRow | null;
  days: RoutineDayRow[];
  /** Solo gli allenamenti CHIUSI: quello in corso sta nella card sopra. */
  sessions: RecentSession[];
  open: RecentSession | null;
}

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
    const [days, sessions, open] = await Promise.all([
      routine ? listRoutineDays(routine.id) : Promise.resolve([]),
      recentSessions(),
      openSession(),
    ]);
    // L'allenamento in corso non e' un "ultimo allenamento": e' scritto in
    // cima, e comparire due volte lo faceva sembrare due allenamenti diversi.
    return {
      routine,
      days,
      sessions: sessions.filter((s) => s.endedAt !== null),
      open,
    };
  }, []);

  const { data, loading, reload } = useFocusData<GymData>(loader);

  const open = data?.open ?? null;

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const isSelecting = selectedIds.size > 0;

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const exitSelection = () => setSelectedIds(new Set());

  // In selezione il tocco spunta, altrimenti apre il dettaglio in sola
  // lettura. Vale anche per la sessione ancora aperta: li' si legge quel che
  // ha registrato finora, e si riprende dalla card in cima alla pagina.
  const onSessionPress = (id: string) => {
    if (isSelecting) toggleSelection(id);
    else navigate("SessionDetail", { id });
  };

  /**
   * Riporta dentro l'allenamento lasciato aperto.
   *
   * La card era solo un'etichetta: chi usciva senza terminare vedeva
   * "Allenamento in corso" e non aveva nessun modo di rientrarci ne' di
   * chiuderlo - `endSession` si raggiunge solo dal "Termina" di `SessionScreen`.
   *
   * Quando il giorno non e' riagganciabile alla scheda attiva - un allenamento
   * libero, o un giorno di una scheda che non e' piu' quella attiva - non c'e'
   * una schermata dal vivo dove tornare: si va al dettaglio, che per una
   * sessione aperta offre "Termina".
   */
  const resumeOpen = () => {
    if (!open) return;
    const dayIndex = data?.days.findIndex((day) => day.id === open.routineDayId);
    if (data?.routine && dayIndex !== undefined && dayIndex >= 0) {
      navigate("Session", { routineId: data.routine.id, dayIndex });
      return;
    }
    navigate("SessionDetail", { id: open.id });
  };

  const onSessionLongPress = (id: string) => {
    if (!isSelecting) toggleSelection(id);
  };

  const removeSelected = async () => {
    if (selectedIds.size === 0 || deleting) return;
    setDeleting(true);
    try {
      await Promise.all([...selectedIds].map((id) => deleteSession(id)));
      exitSelection();
      reload();
      showToast.success({ title: t("gym.sessions_deleted") });
    } catch (error) {
      logger.error("[palestra] eliminazione allenamenti fallita", error);
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  return (
    <View style={styles.root}>
      <ScreenBackground />
      <SafeAreaView edges={["top", "left", "right"]} style={styles.safe}>
        <View style={styles.header}>
          {isSelecting ? (
            <>
              <TouchableOpacity onPress={exitSelection} activeOpacity={0.6} hitSlop={10}>
                <X size={24} color={colors.textSecondary} />
              </TouchableOpacity>
              <Text
                style={[styles.title, { color: colors.text }]}
                numberOfLines={1}
              >
                {t(
                  selectedIds.size === 1
                    ? "gym.sessions_selected_one"
                    : "gym.sessions_selected_many",
                  { count: selectedIds.size },
                )}
              </Text>
              <TouchableOpacity
                onPress={() => setConfirmDelete(true)}
                activeOpacity={0.6}
                hitSlop={10}
              >
                <Trash2 size={22} color={theme.colors.error} />
              </TouchableOpacity>
            </>
          ) : (
            <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
              {t("tabs.gym")}
            </Text>
          )}
        </View>

        {loading && !data ? (
          <ActivityIndicator style={styles.loader} color={colors.accent} />
        ) : (
          <ScrollView
            contentContainerStyle={[
              styles.content,
              { paddingBottom: insets.bottom + theme.spacing.lg },
            ]}
            showsVerticalScrollIndicator={false}
          >
            {open ? (
              <Card onPress={resumeOpen} style={styles.openCard}>
                <Text style={[styles.openTitle, { color: colors.text }]}>
                  {t("gym.session_open")}
                </Text>
                <Text style={[styles.openMeta, { color: colors.textMuted }]}>
                  {open.dayName ?? t("gym.free_workout")} - {formatShortDate(open.date)}
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
              data.sessions.map((session) => {
                const selected = selectedIds.has(session.id);
                return (
                  <Card
                    key={session.id}
                    onPress={() => onSessionPress(session.id)}
                    onLongPress={() => onSessionLongPress(session.id)}
                    style={[
                      styles.sessionRow,
                      selected && { borderColor: colors.accent },
                    ]}
                  >
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
                        {formatShortDate(session.date)} - {t("gym.sets_count", {
                          count: session.workingSets,
                        })}
                        {session.volumeKg > 0
                          ? ` - ${Math.round(session.volumeKg).toLocaleString("it-IT")} kg`
                          : ""}
                      </Text>
                    </View>
                    {isSelecting ? (
                      <View
                        style={[
                          styles.sessionCheck,
                          selected
                            ? { backgroundColor: colors.accent }
                            : {
                                backgroundColor: "transparent",
                                borderWidth: 1,
                                borderColor: colors.border,
                              },
                        ]}
                      >
                        {selected ? (
                          <Check size={14} color={colors.accentOn} />
                        ) : null}
                      </View>
                    ) : null}
                  </Card>
                );
              })
            ) : (
              <Text style={[styles.hint, { color: colors.textMuted }]}>
                {t("gym.no_sessions")}
              </Text>
            )}

            {/* In fondo perche' e' la meta di secondo livello: il gesto
                quotidiano e' toccare il giorno di scheda qui sopra. Gli
                esercizi si raggiungono dal profilo, non serve un secondo
                accesso qui. */}
            {data?.routine ? (
              <View style={[styles.links, styles.section]}>
                <DfButton
                  label={t("gym.routines")}
                  variant="outlined"
                  fullWidth={false}
                  icon={<Dumbbell size={18} color={colors.accent} />}
                  onPress={() => openRoutines("Routines")}
                  style={styles.link}
                />
              </View>
            ) : null}
          </ScrollView>
        )}
      </SafeAreaView>

      <DfAlert
        isOpen={confirmDelete}
        title={t("gym.delete_sessions_title", { count: selectedIds.size })}
        message={t("gym.delete_sessions_message")}
        confirmLabel={t("delete")}
        confirmColor={theme.colors.error}
        cancelLabel={t("cancel")}
        loading={deleting}
        onConfirm={removeSelected}
        onClose={() => setConfirmDelete(false)}
      />
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
  // Il bordo c'e' sempre, trasparente finche' la riga non e' selezionata: se
  // comparisse solo alla selezione, la card si restringerebbe di 1.5 px per
  // lato e tutte le altre scatterebbero in su.
  sessionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    borderWidth: 1.5,
    borderColor: "transparent",
  },
  sessionText: { flex: 1, gap: 2 },
  sessionName: { fontSize: 15, fontWeight: "600" },
  sessionMeta: { fontSize: 13 },
  sessionCheck: {
    width: 22,
    height: 22,
    borderRadius: theme.radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  hint: { fontSize: 13, lineHeight: 18 },
  empty: { gap: theme.spacing.sm },
  links: { flexDirection: "row", gap: theme.spacing.sm },
  link: { flexGrow: 1, flexBasis: 0 },
  section: { marginTop: theme.spacing.md },
});
