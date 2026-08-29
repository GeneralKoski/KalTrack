import { ASSISTANT_FAB_CLEARANCE } from "@/src/containers/assistant/AssistantButton";
import { DfAlert } from "@/src/components/DfAlert";
import { EmptyState, ScreenBackground, SearchBar } from "@/src/components/kal";
import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import { ExerciseListItem } from "@/src/containers/gym/ExerciseListItem";
import {
  searchExercises,
  setExerciseDislike,
  toggleExerciseBan,
} from "@/src/db/queries/exercises";
import { useAppNav } from "@/src/hooks/useAppNav";
import { useFocusData } from "@/src/hooks/useFocusData";
import { useTranslation } from "@/src/hooks/useTranslation";
import { theme } from "@/src/styles";
import type { ExerciseRow } from "@/src/types/gym";
import { ChevronLeft, Dumbbell } from "lucide-react-native";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

const SEARCH_DEBOUNCE_MS = 250;

export function ExercisesScreen() {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const { goBack } = useAppNav();
  const insets = useSafeAreaInsets();

  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");
  const [selected, setSelected] = useState<ExerciseRow | null>(null);

  useEffect(() => {
    const timeout = setTimeout(() => setDebounced(term), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [term]);

  // includeBanned: qui si gestiscono anche i vietati, quindi devono comparire.
  const loader = useCallback(
    () => searchExercises({ term: debounced, includeBanned: true }),
    [debounced],
  );
  const { data, loading, reload } = useFocusData<ExerciseRow[]>(loader);


  const act = async (fn: () => Promise<void>) => {
    await fn();
    setSelected(null);
    reload();
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
            {t("gym.exercises")}
          </Text>
        </View>

        <View style={styles.searchWrap}>
          <SearchBar
            value={term}
            onChangeText={setTerm}
            placeholder={t("gym.search_exercise")}
          />
        </View>

        {loading && !data ? (
          <ActivityIndicator style={styles.loader} color={colors.accent} />
        ) : (
          <FlatList
            data={data ?? []}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <ExerciseListItem exercise={item} onPress={() => setSelected(item)} />
            )}
            contentContainerStyle={[
              styles.list,
              { paddingBottom: insets.bottom + ASSISTANT_FAB_CLEARANCE },
            ]}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <EmptyState
                message={t("gym.no_exercises")}
                icon={<Dumbbell size={40} color={colors.textFaint} />}
              />
            }
          />
        )}
      </SafeAreaView>

      <DfAlert
        isOpen={selected !== null}
        title={selected?.name}
        message={selected?.instructions ?? undefined}
        confirmLabel={
          selected?.is_banned === 1 ? t("gym.unban") : t("gym.ban")
        }
        cancelLabel={t("close")}
        onConfirm={() =>
          selected && act(() => toggleExerciseBan(selected.id))
        }
        onClose={() => setSelected(null)}
        footerExtra={
          selected ? (
            <TouchableOpacity
              onPress={() =>
                act(() =>
                  setExerciseDislike(
                    selected.id,
                    selected.dislike_level > 0 ? 0 : 2,
                  ),
                )
              }
              activeOpacity={0.6}
            >
              <Text style={[styles.dislike, { color: colors.textMuted }]}>
                {selected.dislike_level > 0
                  ? t("gym.undislike")
                  : t("gym.dislike")}
              </Text>
            </TouchableOpacity>
          ) : null
        }
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
  searchWrap: {
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
  },
  list: { paddingHorizontal: theme.spacing.md },
  separator: { height: theme.spacing.sm },
  loader: { marginTop: theme.spacing.xl },
  dislike: { fontSize: 13, fontWeight: "600", textAlign: "center", paddingTop: 4 },
});
