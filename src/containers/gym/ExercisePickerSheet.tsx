import { DfBottomSheet } from "@/src/components/DfBottomSheet";
import { Chip, EmptyState, SearchBar } from "@/src/components/kal";
import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import { searchExercises } from "@/src/db/queries/exercises";
import { useTranslation } from "@/src/hooks/useTranslation";
import { theme } from "@/src/styles";
import {
  exerciseEquipment,
  type ExerciseRow,
  type MuscleGroup,
} from "@/src/types/gym";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import React, { forwardRef, useEffect, useState } from "react";
import { ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";

const MUSCLE_GROUPS: MuscleGroup[] = [
  "petto",
  "schiena",
  "spalle",
  "bicipiti",
  "tricipiti",
  "quadricipiti",
  "femorali",
  "glutei",
  "polpacci",
  "addome",
  "avambracci",
  "full_body",
];

/** Risultati mostrati: oltre non si scorre, si cerca. */
const PICKER_LIMIT = 30;
const SEARCH_DEBOUNCE_MS = 250;

interface ExercisePickerSheetProps {
  onPick: (exercise: ExerciseRow) => void;
}

export const ExercisePickerSheet = forwardRef<
  BottomSheetModal,
  ExercisePickerSheetProps
>(({ onPick }, ref) => {
  const { t } = useTranslation();
  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");
  const [group, setGroup] = useState<MuscleGroup | null>(null);
  const [rows, setRows] = useState<ExerciseRow[]>([]);

  useEffect(() => {
    const timeout = setTimeout(() => setDebounced(term), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [term]);

  useEffect(() => {
    let active = true;
    (async () => {
      const found = await searchExercises({
        term: debounced,
        muscleGroup: group ?? undefined,
        limit: PICKER_LIMIT,
      });
      if (active) setRows(found);
    })();
    return () => {
      active = false;
    };
  }, [debounced, group]);

  return (
    <DfBottomSheet ref={ref} title={t("gym.pick_exercise")}>
      <View style={styles.search}>
        <SearchBar
          value={term}
          onChangeText={setTerm}
          placeholder={t("gym.search_exercise")}
        />
      </View>

      {/*
        I gruppi muscolari sono dodici: in una riga a capo l'altezza del blocco
        cambierebbe al variare dei filtri e sposterebbe i risultati sotto.
      */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.groups}
      >
        <Chip
          label={t("gym.all_muscles")}
          active={group === null}
          onPress={() => setGroup(null)}
        />
        {MUSCLE_GROUPS.map((item) => (
          <Chip
            key={item}
            label={t(`gym.muscle.${item}`)}
            active={group === item}
            onPress={() => setGroup(item)}
          />
        ))}
      </ScrollView>

      {/*
        map() e non FlatList: DfBottomSheet avvolge già i figli in un
        BottomSheetScrollView, e annidarci una lista virtualizzata rompe lo
        scroll ("VirtualizedLists should never be nested"). I risultati sono
        limitati a PICKER_LIMIT, quindi il costo è trascurabile.
      */}
      {rows.length === 0 ? (
        <EmptyState message={t("gym.no_exercises")} />
      ) : (
        rows.map((item, index) => (
          <PickerRow
            key={item.id}
            exercise={item}
            isLast={index === rows.length - 1}
            onPress={() => onPick(item)}
          />
        ))
      )}
    </DfBottomSheet>
  );
});

ExercisePickerSheet.displayName = "ExercisePickerSheet";

const PickerRow: React.FC<{
  exercise: ExerciseRow;
  isLast: boolean;
  onPress: () => void;
}> = ({ exercise, isLast, onPress }) => {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const equipment = exerciseEquipment(exercise);

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.6}
      style={[
        styles.row,
        { borderBottomColor: colors.border, borderBottomWidth: isLast ? 0 : 1 },
      ]}
    >
      <Text style={[styles.rowTitle, { color: colors.text }]} numberOfLines={1}>
        {exercise.name}
      </Text>
      <Text
        style={[styles.rowSubtitle, { color: colors.textMuted }]}
        numberOfLines={1}
      >
        {t(`gym.muscle.${exercise.muscle_group}`)}
        {equipment.length > 0
          ? ` · ${equipment.map((item) => t(`gym.equipment.${item}`)).join(", ")}`
          : ""}
      </Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  search: { marginBottom: theme.spacing.sm },
  groups: {
    gap: theme.spacing.sm,
    paddingBottom: theme.spacing.sm,
  },
  row: {
    // md e senza bordo sull'ultima riga: stessa altezza e stesso divisore
    // del drawer di riferimento (scelta pasto in AddEntrySheet).
    paddingVertical: theme.spacing.md,
  },
  rowTitle: { fontSize: 15, fontWeight: "500" },
  rowSubtitle: { fontSize: 13, marginTop: 1, textTransform: "capitalize" },
});
