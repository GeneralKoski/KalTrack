import { DfAlert } from "@/src/components/DfAlert";
import { DfButton } from "@/src/components/form/DfButton";
import { Card, EmptyState, ScreenBackground, SectionLabel } from "@/src/components/kal";
import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import { AlternativesSheet } from "@/src/containers/gym/AlternativesSheet";
import { RestTimer } from "@/src/containers/gym/RestTimer";
import { SetRow } from "@/src/containers/gym/SetRow";
import {
  endSession,
  getRoutineDay,
  lastSetsFor,
  logSet,
  personalBest,
  startSession,
  type PersonalBest,
  type ResolvedBlock,
  type ResolvedDay,
} from "@/src/db/queries/workouts";
import { todayIso } from "@/src/domain/date";
import { suggestNextWeight } from "@/src/domain/strength";
import { useAppNav } from "@/src/hooks/useAppNav";
import { useTranslation } from "@/src/hooks/useTranslation";
import { theme } from "@/src/styles";
import type { ExerciseRow, SessionSetRow } from "@/src/types/gym";
import { logger } from "@/src/utils/logger";
import { showToast } from "@/src/utils/toast";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import { useRoute, type RouteProp } from "@react-navigation/native";
import { ChevronLeft, Dumbbell, Repeat2 } from "lucide-react-native";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

/** Quando la scheda non dice quante serie fare, tre è la risposta meno sbagliata. */
const DEFAULT_SETS = 3;
const DEFAULT_REST_SECONDS = 90;
/** Il salto più piccolo possibile con i dischi di una palestra normale. */
const WEIGHT_INCREMENT_KG = 2.5;
/** Spazio lasciato sotto la lista perché il timer non copra l'ultima serie. */
const TIMER_CLEARANCE = 110;

type SessionRoute = RouteProp<
  { params: { routineId: string; dayIndex: number } },
  "params"
>;

interface ExerciseInfo {
  lastSets: SessionSetRow[];
  best: PersonalBest | null;
}

interface SetValues {
  weight: string;
  reps: string;
}

/** Una serie nell'ordine in cui va eseguita, non nell'ordine in cui è scritta. */
interface PlannedSet {
  key: string;
  blockId: string;
  blockExerciseId: string;
  exercise: ExerciseRow;
  setIndex: number;
  round: number;
}

const formatNumber = (value: number): string =>
  Number.isInteger(value) ? String(value) : String(value).replace(".", ",");

const parseNumber = (text: string): number | null => {
  const parsed = Number(text.replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

/** Da "8-10" o "10 per lato" si tiene il primo numero: è il target minimo. */
const parseFirstInt = (text: string | null): number | null => {
  if (!text) return null;
  const match = /\d+/.exec(text);
  return match ? Number(match[0]) : null;
};

const heaviestSet = (sets: SessionSetRow[]): SessionSetRow | null =>
  sets.reduce<SessionSetRow | null>(
    (best, row) =>
      row.weight !== null && (best === null || row.weight > (best.weight ?? 0))
        ? row
        : best,
    null,
  );

/**
 * L'ordine di esecuzione delle serie di un blocco.
 *
 * In superset e circuito si alternano gli esercizi giro per giro: presentarli
 * uno dopo l'altro sarebbe un altro allenamento, non una resa grafica diversa.
 */
function planBlock(
  block: ResolvedBlock,
  resolve: (blockExerciseId: string, fallback: ExerciseRow) => ExerciseRow,
): PlannedSet[] {
  const entries = block.exercises.map((item) => ({
    id: item.row.id,
    exercise: resolve(item.row.id, item.exercise),
    sets: item.row.target_sets ?? DEFAULT_SETS,
  }));

  const planned: PlannedSet[] = [];
  const push = (
    entry: (typeof entries)[number],
    setIndex: number,
    round: number,
  ) => {
    planned.push({
      key: `${block.block.id}:${entry.id}:${setIndex}`,
      blockId: block.block.id,
      blockExerciseId: entry.id,
      exercise: entry.exercise,
      setIndex,
      round,
    });
  };

  const interleaved = block.kind === "superset" || block.kind === "circuit";
  if (interleaved) {
    const rounds = Math.max(...entries.map((entry) => entry.sets), 0);
    for (let round = 0; round < rounds; round++) {
      for (const entry of entries) {
        if (round < entry.sets) push(entry, round, round);
      }
    }
    return planned;
  }

  for (const entry of entries) {
    for (let setIndex = 0; setIndex < entry.sets; setIndex++) {
      push(entry, setIndex, setIndex);
    }
  }
  return planned;
}

export function SessionScreen() {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const { goBack } = useAppNav();
  const insets = useSafeAreaInsets();
  const route = useRoute<SessionRoute>();
  const { routineId, dayIndex } = route.params;

  const [day, setDay] = useState<ResolvedDay | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [infos, setInfos] = useState<Record<string, ExerciseInfo>>({});
  const [values, setValues] = useState<Record<string, SetValues>>({});
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [substitutions, setSubstitutions] = useState<Record<string, ExerciseRow>>({});
  const [rest, setRest] = useState<{ key: string; seconds: number } | null>(null);
  const [confirmFinish, setConfirmFinish] = useState(false);
  const [replacing, setReplacing] = useState<{
    blockExerciseId: string;
    exercise: ExerciseRow;
  } | null>(null);

  const sheetRef = useRef<BottomSheetModal>(null);
  // La sessione si apre una volta sola: in StrictMode l'effetto gira due volte
  // e senza guardia resterebbe un allenamento vuoto nel diario.
  const startedRef = useRef(false);

  const loadInfo = useCallback(async (exerciseId: string) => {
    const [sets, best] = await Promise.all([
      lastSetsFor(exerciseId),
      personalBest(exerciseId),
    ]);
    setInfos((prev) => ({ ...prev, [exerciseId]: { lastSets: sets, best } }));
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const resolved = await getRoutineDay(routineId, dayIndex);
        if (!active) return;
        setDay(resolved);
        if (!resolved) return;

        if (!startedRef.current) {
          startedRef.current = true;
          const id = await startSession({
            date: todayIso(),
            routineDayId: resolved.day.id,
          });
          if (active) setSessionId(id);
        }

        const ids = new Set<string>();
        for (const block of resolved.blocks) {
          for (const item of block.exercises) ids.add(item.exercise.id);
        }
        await Promise.all([...ids].map(loadInfo));
      } catch (error) {
        logger.error("[SessionScreen] errore avvio sessione", error);
        showToast.error({ message: t("general_error") });
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
    // t è ricreata a ogni cambio lingua: non deve far ripartire la sessione.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routineId, dayIndex, loadInfo]);

  const resolveExercise = useCallback(
    (blockExerciseId: string, fallback: ExerciseRow): ExerciseRow =>
      substitutions[blockExerciseId] ?? fallback,
    [substitutions],
  );

  /** I campi partono dall'ultima volta; senza storico restano vuoti. */
  const defaultValues = (
    exerciseId: string,
    setIndex: number,
    targetWeight: number | null,
    targetReps: string | null,
  ): SetValues => {
    const lastSets = infos[exerciseId]?.lastSets ?? [];
    const last = lastSets[setIndex] ?? lastSets[lastSets.length - 1];
    const weight = last?.weight ?? targetWeight;
    const reps = last?.reps ?? parseFirstInt(targetReps);
    return {
      weight: weight !== null && weight !== undefined ? formatNumber(weight) : "",
      reps: reps !== null && reps !== undefined ? String(reps) : "",
    };
  };

  const suggestedWeight = (
    exerciseId: string,
    targetReps: string | null,
  ): number | null => {
    const target = parseFirstInt(targetReps);
    if (target === null) return null;
    const lastSets = (infos[exerciseId]?.lastSets ?? [])
      .filter((row) => row.weight !== null && row.reps !== null)
      .map((row) => ({ weight: row.weight ?? 0, reps: row.reps ?? 0 }));
    if (lastSets.length === 0) return null;
    return suggestNextWeight({
      lastSets,
      targetReps: target,
      increment: WEIGHT_INCREMENT_KG,
    });
  };

  const setValue = (key: string, patch: Partial<SetValues>, base: SetValues) => {
    setValues((prev) => ({ ...prev, [key]: { ...base, ...patch } }));
  };

  const completeSet = async (
    planned: PlannedSet,
    current: SetValues,
    restSeconds: number,
  ) => {
    if (!sessionId) return;
    try {
      await logSet({
        sessionId,
        exerciseId: planned.exercise.id,
        setIndex: planned.setIndex,
        reps: parseNumber(current.reps),
        weight: parseNumber(current.weight),
        blockRef: planned.blockId,
      });
      setDone((prev) => ({ ...prev, [planned.key]: true }));
      // Chiave nuova a ogni serie: il timer riparte da capo invece di riprendere
      // il conteggio della serie precedente.
      setRest({ key: `${planned.key}:${Date.now()}`, seconds: restSeconds });
    } catch (error) {
      logger.error("[SessionScreen] errore salvataggio serie", error);
      showToast.error({ message: t("general_error") });
    }
  };

  const finish = async () => {
    setConfirmFinish(false);
    try {
      if (sessionId) await endSession(sessionId);
    } catch (error) {
      logger.error("[SessionScreen] errore chiusura sessione", error);
    }
    goBack();
  };

  const openAlternatives = (blockExerciseId: string, exercise: ExerciseRow) => {
    setReplacing({ blockExerciseId, exercise });
    sheetRef.current?.present();
  };

  const pickAlternative = async (alternative: ExerciseRow) => {
    if (!replacing) return;
    setSubstitutions((prev) => ({
      ...prev,
      [replacing.blockExerciseId]: alternative,
    }));
    sheetRef.current?.dismiss();
    await loadInfo(alternative.id);
  };

  return (
    <View style={styles.root}>
      <ScreenBackground />
      <SafeAreaView edges={["top", "left", "right"]} style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity onPress={goBack} activeOpacity={0.6} hitSlop={10}>
            <ChevronLeft size={26} color={colors.textSecondary} />
          </TouchableOpacity>
          <Text
            style={[styles.title, { color: colors.text }]}
            numberOfLines={1}
          >
            {day?.name ?? t("gym.session")}
          </Text>
          <DfButton
            label={t("gym.finish")}
            onPress={() => setConfirmFinish(true)}
            variant="outlined"
            fullWidth={false}
            style={styles.finish}
          />
        </View>

        {loading ? (
          <ActivityIndicator style={styles.loader} color={colors.accent} />
        ) : !day ? (
          <EmptyState
            message={t("gym.day_not_found")}
            icon={<Dumbbell size={40} color={colors.textFaint} />}
          />
        ) : (
          <ScrollView
            contentContainerStyle={[
              styles.list,
              {
                paddingBottom:
                  insets.bottom + (rest ? TIMER_CLEARANCE : theme.spacing.lg),
              },
            ]}
            keyboardShouldPersistTaps="handled"
          >
            {day.blocks.map((block) => {
              const planned = planBlock(block, resolveExercise);
              const restSeconds = block.block.rest_seconds ?? DEFAULT_REST_SECONDS;
              const interleaved =
                block.kind === "superset" || block.kind === "circuit";

              return (
                <Card key={block.block.id} style={styles.block}>
                  {block.kind !== "single" ? (
                    <View
                      style={[styles.blockTag, { backgroundColor: colors.surfaceMuted }]}
                    >
                      <Text style={[styles.blockTagText, { color: colors.textSecondary }]}>
                        {t(`gym.block_${block.kind}`)}
                      </Text>
                    </View>
                  ) : null}

                  {block.exercises.map((item) => {
                    const exercise = resolveExercise(item.row.id, item.exercise);
                    const info = infos[exercise.id];
                    const suggested = suggestedWeight(
                      exercise.id,
                      item.row.target_reps,
                    );
                    // La serie più pesante dell'ultima volta, non la prima:
                    // è quella che dice davvero a che punto si era.
                    const lastTop = heaviestSet(info?.lastSets ?? []);

                    return (
                      <View key={item.row.id} style={styles.exercise}>
                        <Text
                          style={[styles.exerciseName, { color: colors.text }]}
                          numberOfLines={2}
                        >
                          {exercise.name}
                        </Text>
                        <Text
                          style={[styles.meta, { color: colors.textMuted }]}
                          numberOfLines={1}
                        >
                          {`${item.row.target_sets ?? DEFAULT_SETS} ${t("gym.sets")}`}
                          {item.row.target_reps
                            ? ` × ${item.row.target_reps} ${t("gym.reps")}`
                            : ""}
                        </Text>

                        <Text
                          style={[styles.meta, { color: colors.textMuted }]}
                          numberOfLines={1}
                        >
                          {lastTop && lastTop.weight !== null
                            ? t("gym.last_time", {
                                value: `${formatNumber(lastTop.weight)} ${t("gym.kg")} × ${lastTop.reps ?? "-"}`,
                              })
                            : t("gym.no_history")}
                        </Text>

                        {info?.best ? (
                          <Text
                            style={[styles.meta, { color: colors.textMuted }]}
                            numberOfLines={1}
                          >
                            {t("gym.personal_best", {
                              weight: formatNumber(info.best.weight),
                              reps: info.best.reps,
                            })}
                          </Text>
                        ) : null}

                        {suggested !== null ? (
                          <Text
                            style={[styles.suggested, { color: colors.text }]}
                            numberOfLines={1}
                          >
                            {t("gym.suggested_weight", {
                              weight: formatNumber(suggested),
                            })}
                          </Text>
                        ) : null}

                        <TouchableOpacity
                          onPress={() => openAlternatives(item.row.id, exercise)}
                          activeOpacity={0.6}
                          style={[styles.altButton, { borderColor: colors.border }]}
                        >
                          <Repeat2 size={15} color={colors.textSecondary} />
                          <Text
                            style={[styles.altLabel, { color: colors.textSecondary }]}
                            numberOfLines={1}
                          >
                            {t("gym.alternatives")}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    );
                  })}

                  <View style={[styles.divider, { backgroundColor: colors.border }]} />

                  {planned.map((entry, index) => {
                    const source = block.exercises.find(
                      (item) => item.row.id === entry.blockExerciseId,
                    );
                    const base = defaultValues(
                      entry.exercise.id,
                      entry.setIndex,
                      source?.row.target_weight ?? null,
                      source?.row.target_reps ?? null,
                    );
                    const current = values[entry.key] ?? base;
                    const newRound =
                      interleaved &&
                      (index === 0 || planned[index - 1].round !== entry.round);

                    return (
                      <React.Fragment key={entry.key}>
                        {newRound ? (
                          <SectionLabel style={styles.round}>
                            {t("gym.round", { n: entry.round + 1 })}
                          </SectionLabel>
                        ) : null}
                        <SetRow
                          setNumber={entry.setIndex + 1}
                          exerciseName={
                            block.exercises.length > 1
                              ? entry.exercise.name
                              : undefined
                          }
                          targetReps={source?.row.target_reps ?? null}
                          weight={current.weight}
                          reps={current.reps}
                          done={done[entry.key] === true}
                          onChangeWeight={(value) =>
                            setValue(entry.key, { weight: value }, current)
                          }
                          onChangeReps={(value) =>
                            setValue(entry.key, { reps: value }, current)
                          }
                          onDone={() => completeSet(entry, current, restSeconds)}
                        />
                      </React.Fragment>
                    );
                  })}
                </Card>
              );
            })}
          </ScrollView>
        )}
      </SafeAreaView>

      {/* Fuori dalla ScrollView: scorrere la pagina non deve fermare il recupero. */}
      {rest ? (
        <View
          style={[styles.timer, { bottom: insets.bottom + theme.spacing.sm }]}
          pointerEvents="box-none"
        >
          <RestTimer
            key={rest.key}
            seconds={rest.seconds}
            onFinish={() => setRest(null)}
            onSkip={() => setRest(null)}
          />
        </View>
      ) : null}

      <AlternativesSheet
        ref={sheetRef}
        exercise={replacing?.exercise ?? null}
        onPick={pickAlternative}
      />

      <DfAlert
        isOpen={confirmFinish}
        title={t("gym.finish_title")}
        message={t("gym.finish_message")}
        confirmLabel={t("gym.finish")}
        cancelLabel={t("cancel")}
        onConfirm={finish}
        onClose={() => setConfirmFinish(false)}
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
  title: { flex: 1, flexShrink: 1, fontSize: 18, fontWeight: "700" },
  finish: { paddingHorizontal: 0 },
  loader: { marginTop: theme.spacing.xl },
  list: { paddingHorizontal: theme.spacing.md, gap: theme.spacing.md },
  block: { gap: theme.spacing.xs },
  blockTag: {
    alignSelf: "flex-start",
    borderRadius: theme.radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: theme.spacing.xs,
  },
  blockTagText: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  exercise: { gap: 2, marginBottom: theme.spacing.xs },
  exerciseName: { flexShrink: 1, fontSize: 17, fontWeight: "700" },
  meta: { flexShrink: 1, fontSize: 12 },
  suggested: { flexShrink: 1, fontSize: 13, fontWeight: "600", marginTop: 2 },
  altButton: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: theme.radius.full,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: theme.spacing.xs,
  },
  altLabel: { flexShrink: 1, fontSize: 13, fontWeight: "600" },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: theme.spacing.xs },
  round: { marginTop: theme.spacing.xs, marginBottom: 0 },
  timer: {
    position: "absolute",
    left: theme.spacing.md,
    right: theme.spacing.md,
  },
});
