import { DfAlert } from "@/src/components/DfAlert";
import { FormScreen } from "@/src/components/FormScreen";
import { DfButton } from "@/src/components/form/DfButton";
import { Chip, EmptyState, ScreenBackground, SectionLabel } from "@/src/components/kal";
import { useAppTheme } from "@/src/components/ThemeContext";
import { Text, TextInput } from "@/src/components/ui";
import {
  BlockEditor,
  type DraftBlock,
  type DraftExercise,
} from "@/src/containers/gym/BlockEditor";
import { ExercisePickerSheet } from "@/src/containers/gym/ExercisePickerSheet";
import { newId } from "@/src/db/ids";
import {
  createRoutine,
  getRoutineDay,
  listRoutineDays,
  listRoutines,
  updateRoutine,
  type RoutineInput,
} from "@/src/db/queries/workouts";
import { useAppNav } from "@/src/hooks/useAppNav";
import { useTranslation } from "@/src/hooks/useTranslation";
import { theme } from "@/src/styles";
import type { ExerciseRow } from "@/src/types/gym";
import { showToast } from "@/src/utils/toast";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import { useRoute, type RouteProp } from "@react-navigation/native";
import { ChevronLeft, Pencil, Plus, Trash2 } from "lucide-react-native";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

interface DraftDay {
  key: string;
  name: string;
  blocks: DraftBlock[];
}

/** Su cosa sta lavorando il picker: un blocco nuovo o uno già esistente. */
type PickerTarget = { type: "block" } | { type: "exercise"; blockKey: string };

const DEFAULT_SETS = "3";
const DEFAULT_REPS = "8-10";
const DEFAULT_REST = "90";

const toNumber = (value: string): number | null => {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

/**
 * Il recupero e' l'unico campo dove zero e' una risposta e non un campo vuoto:
 * in un circuito si passa all'esercizio dopo senza pausa. Con la regola
 * generale (> 0) uno zero diventava null, e alla riapertura la scheda mostrava
 * i 90 secondi di default al posto della scelta dell'utente.
 */
const toRestSeconds = (value: string): number | null => {
  if (value.trim() === "") return null;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

export function RoutineFormScreen() {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const { goBack } = useAppNav();
  const route = useRoute<RouteProp<{ params: { id?: string } }, "params">>();
  const id = route.params?.id;
  const pickerRef = useRef<BottomSheetModal>(null);

  const [loading, setLoading] = useState(Boolean(id));
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [days, setDays] = useState<DraftDay[]>([]);
  const [dayIndex, setDayIndex] = useState(0);
  const [pickerTarget, setPickerTarget] = useState<PickerTarget | null>(null);
  const [renameText, setRenameText] = useState<string | null>(null);
  const [confirmDeleteDay, setConfirmDeleteDay] = useState(false);

  useEffect(() => {
    if (!id) return;
    let active = true;
    (async () => {
      // Nessuna query "getRoutine": la scheda si pesca dall'elenco, che è
      // comunque corto e già filtrato sui non cancellati.
      const routine = (await listRoutines()).find((item) => item.id === id);
      if (!routine) {
        if (active) setLoading(false);
        return;
      }
      const rows = await listRoutineDays(id);
      const drafts: DraftDay[] = [];
      for (let index = 0; index < rows.length; index++) {
        const resolved = await getRoutineDay(id, index);
        if (!resolved) continue;
        drafts.push({
          key: resolved.day.id,
          name: resolved.name,
          blocks: resolved.blocks.map((block) => ({
            key: block.block.id,
            kind: block.kind,
            rest:
              block.block.rest_seconds === null
                ? ""
                : String(block.block.rest_seconds),
            exercises: block.exercises.map((item) => ({
              key: item.row.id,
              exerciseId: item.exercise.id,
              name: item.exercise.name,
              muscleGroup: item.exercise.muscle_group,
              sets:
                item.row.target_sets === null ? "" : String(item.row.target_sets),
              reps: item.row.target_reps ?? "",
            })),
          })),
        });
      }
      if (!active) return;
      setName(routine.name);
      setDays(drafts);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [id]);

  const day = days[dayIndex];

  const updateDay = (patch: (current: DraftDay) => DraftDay) =>
    setDays((prev) =>
      prev.map((item, index) => (index === dayIndex ? patch(item) : item)),
    );

  const addDay = () => {
    setDays((prev) => [
      ...prev,
      {
        key: newId(),
        name: t("gym.day_default_name", { index: prev.length + 1 }),
        blocks: [],
      },
    ]);
    setDayIndex(days.length);
  };

  const removeDay = () => {
    setDays((prev) => prev.filter((_, index) => index !== dayIndex));
    setDayIndex((current) => Math.max(0, current - 1));
    setConfirmDeleteDay(false);
  };

  const openPicker = (target: PickerTarget) => {
    setPickerTarget(target);
    pickerRef.current?.present();
  };

  const onPick = (exercise: ExerciseRow) => {
    pickerRef.current?.dismiss();
    const target = pickerTarget;
    setPickerTarget(null);
    if (!target) return;

    const draft: DraftExercise = {
      key: newId(),
      exerciseId: exercise.id,
      name: exercise.name,
      muscleGroup: exercise.muscle_group,
      sets: DEFAULT_SETS,
      reps: DEFAULT_REPS,
    };

    updateDay((current) => {
      if (target.type === "block") {
        return {
          ...current,
          blocks: [
            ...current.blocks,
            { key: newId(), kind: "single", rest: DEFAULT_REST, exercises: [draft] },
          ],
        };
      }
      return {
        ...current,
        blocks: current.blocks.map((block) =>
          block.key !== target.blockKey
            ? block
            : {
                ...block,
                // Un blocco "singolo" con due esercizi non vuol dire niente:
                // aggiungerne uno significa volerli alternare, quindi il tipo
                // diventa superset finché non si sceglie diversamente.
                kind: block.kind === "single" ? "superset" : block.kind,
                exercises: [...block.exercises, draft],
              },
        ),
      };
    });
  };

  const onSave = async () => {
    if (!name.trim()) {
      showToast.error({ title: t("gym.routine_name_required") });
      return;
    }
    setSaving(true);
    try {
      const input: RoutineInput = {
        name: name.trim(),
        days: days.map((item, index) => ({
          name: item.name.trim() || t("gym.day_default_name", { index: index + 1 }),
          // Un blocco senza esercizi non è un allenamento: si scarta al salvataggio
          // invece di impedirne la creazione mentre si costruisce la scheda.
          blocks: item.blocks
            .filter((block) => block.exercises.length > 0)
            .map((block) => ({
              kind: block.kind,
              restSeconds: toRestSeconds(block.rest),
              exercises: block.exercises.map((exercise) => ({
                exerciseId: exercise.exerciseId,
                targetSets: toNumber(exercise.sets),
                targetReps: exercise.reps.trim() || null,
              })),
            })),
        })),
      };

      if (id) {
        await updateRoutine(id, input);
      } else {
        await createRoutine(input);
      }
      showToast.success({ title: t("gym.routine_saved") });
      goBack();
    } catch {
      showToast.error({ title: t("general_error") });
    } finally {
      setSaving(false);
    }
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
            {id ? t("gym.edit_routine_title") : t("gym.new_routine_title")}
          </Text>
        </View>

        {loading ? (
          <ActivityIndicator style={styles.loader} color={colors.accent} />
        ) : (
          <FormScreen contentContainerStyle={styles.content} bottomSpacing={theme.spacing.lg}>
            <Text style={[styles.label, { color: colors.textMuted }]}>
              {t("gym.routine_name")}
            </Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder={t("gym.routine_name_placeholder")}
              placeholderTextColor={colors.textFaint}
              style={[
                styles.input,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  color: colors.text,
                },
              ]}
            />

            <SectionLabel style={styles.section}>{t("gym.days")}</SectionLabel>

            {/*
              I giorni sono un numero variabile: la riga scorre in orizzontale,
              così l'altezza del blocco non cambia mai e il contenuto sotto resta
              fermo mentre se ne aggiungono.
            */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              // Senza il freno la ScrollView prende tutta l'altezza del form,
              // e i chip si stirano con lei: "Aggiungi giorno" diventava un
              // ovale alto mezzo schermo.
              style={styles.chipScroll}
              contentContainerStyle={styles.dayChips}
            >
              {days.map((item, index) => (
                <Chip
                  key={item.key}
                  label={item.name}
                  active={index === dayIndex}
                  onPress={() => setDayIndex(index)}
                />
              ))}
              <TouchableOpacity
                onPress={addDay}
                activeOpacity={0.6}
                style={[styles.addDay, { borderColor: colors.border }]}
              >
                <Plus size={16} color={colors.text} />
                <Text style={[styles.addDayLabel, { color: colors.text }]}>
                  {t("gym.add_day")}
                </Text>
              </TouchableOpacity>
            </ScrollView>

            {day ? (
              <>
                <View style={styles.dayHead}>
                  <Text
                    style={[styles.dayName, { color: colors.text }]}
                    numberOfLines={1}
                  >
                    {day.name}
                  </Text>
                  <TouchableOpacity
                    onPress={() => setRenameText(day.name)}
                    activeOpacity={0.6}
                    hitSlop={10}
                  >
                    <Pencil size={18} color={colors.textFaint} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setConfirmDeleteDay(true)}
                    activeOpacity={0.6}
                    hitSlop={10}
                  >
                    <Trash2 size={18} color={colors.textFaint} />
                  </TouchableOpacity>
                </View>

                {day.blocks.length === 0 ? (
                  <EmptyState message={t("gym.no_blocks")} />
                ) : (
                  day.blocks.map((block, index) => (
                    <View key={block.key} style={styles.block}>
                      <BlockEditor
                        block={block}
                        index={index}
                        onChange={(next) =>
                          updateDay((current) => ({
                            ...current,
                            blocks: current.blocks.map((item) =>
                              item.key === block.key ? next : item,
                            ),
                          }))
                        }
                        onRemove={() =>
                          updateDay((current) => ({
                            ...current,
                            blocks: current.blocks.filter(
                              (item) => item.key !== block.key,
                            ),
                          }))
                        }
                        onAddExercise={() =>
                          openPicker({ type: "exercise", blockKey: block.key })
                        }
                      />
                    </View>
                  ))
                )}

                <DfButton
                  label={t("gym.add_block")}
                  variant="outlined"
                  icon={<Plus size={18} color={colors.accent} />}
                  onPress={() => openPicker({ type: "block" })}
                  style={styles.addBlock}
                />
              </>
            ) : (
              <EmptyState message={t("gym.no_days")} />
            )}

            <DfButton
              label={t("save")}
              loading={saving}
              onPress={onSave}
              style={styles.save}
            />
          </FormScreen>
        )}
      </SafeAreaView>

      <ExercisePickerSheet ref={pickerRef} onPick={onPick} />

      <DfAlert
        isOpen={renameText !== null}
        title={t("gym.rename_day")}
        confirmLabel={t("save")}
        onConfirm={() => {
          const value = (renameText ?? "").trim();
          if (value) updateDay((current) => ({ ...current, name: value }));
          setRenameText(null);
        }}
        onClose={() => setRenameText(null)}
      >
        <TextInput
          value={renameText ?? ""}
          onChangeText={setRenameText}
          autoFocus
          selectTextOnFocus
          placeholder={t("gym.day_name")}
          placeholderTextColor={colors.textFaint}
          style={[
            styles.input,
            { borderColor: colors.border, color: colors.text },
          ]}
        />
      </DfAlert>

      <DfAlert
        isOpen={confirmDeleteDay}
        title={t("gym.delete_day_title")}
        message={t("gym.delete_day_message")}
        confirmLabel={t("delete")}
        confirmColor={theme.colors.error}
        onConfirm={removeDay}
        onClose={() => setConfirmDeleteDay(false)}
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
  title: { flex: 1, fontSize: 18, fontWeight: "700" },
  content: { flexGrow: 1, padding: theme.spacing.md },
  label: {
    fontSize: 13,
    fontWeight: "600",
    marginBottom: theme.spacing.xs,
  },
  input: {
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    fontSize: 15,
  },
  section: { marginTop: theme.spacing.lg },
  chipScroll: { flexGrow: 0 },
  dayChips: {
    alignItems: "center",
    gap: theme.spacing.sm,
    paddingBottom: theme.spacing.xs,
  },
  addDay: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs,
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: theme.radius.full,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 9,
  },
  addDayLabel: { fontSize: 14, fontWeight: "600" },
  dayHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  dayName: { flexGrow: 1, flexShrink: 1, fontSize: 17, fontWeight: "700" },
  block: { marginBottom: theme.spacing.sm },
  addBlock: { marginTop: theme.spacing.xs },
  save: { marginTop: theme.spacing.lg },
  loader: { marginTop: theme.spacing.xl },
});
