import {
  EmptyState,
  ScreenBackground,
  SearchBar,
} from "@/src/components/kal";
import { ExerciseFormSheet } from "@/src/containers/gym/ExerciseFormSheet";
import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import { ExerciseListItem } from "@/src/containers/gym/ExerciseListItem";
import { searchExercises } from "@/src/db/queries/exercises";
import { useAppNav } from "@/src/hooks/useAppNav";
import { useFocusData } from "@/src/hooks/useFocusData";
import { useTranslation } from "@/src/hooks/useTranslation";
import { importCatalog } from "@/src/services/exerciseCatalog";
import { theme } from "@/src/styles";
import type { ExerciseRow } from "@/src/types/gym";
import { showToast } from "@/src/utils/toast";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import { ChevronLeft, CloudDownload, Dumbbell, Plus } from "lucide-react-native";
import React, { useCallback, useEffect, useRef, useState } from "react";
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
  const { goBack, navigate } = useAppNav();
  const insets = useSafeAreaInsets();

  const formRef = useRef<BottomSheetModal>(null);
  const [term, setTerm] = useState("");
  const [importing, setImporting] = useState(false);
  const [debounced, setDebounced] = useState("");

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


  const aggiornaCatalogo = async () => {
    setImporting(true);
    try {
      const aggiunti = await importCatalog();
      showToast.success({
        title:
          aggiunti === 0
            ? t("gym.imported_none")
            : t("gym.imported_some", { count: aggiunti }),
      });
      if (aggiunti > 0) reload();
    } finally {
      setImporting(false);
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
          <Text
            style={[styles.title, { color: colors.text }]}
            numberOfLines={1}
          >
            {t("gym.exercises")}
          </Text>

          {/* Il catalogo si aggiorna a mano e non da solo: e' una lettura dal
              server, e l'app deve restare utilizzabile identica senza rete. */}
          <TouchableOpacity
            onPress={() => void aggiornaCatalogo()}
            activeOpacity={0.6}
            hitSlop={10}
            disabled={importing}
          >
            <CloudDownload
              size={22}
              color={importing ? colors.textFaint : colors.textSecondary}
            />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => formRef.current?.present()}
            activeOpacity={0.6}
            hitSlop={10}
          >
            <Plus size={24} color={colors.text} />
          </TouchableOpacity>
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
              <ExerciseListItem
                exercise={item}
                onPress={() => navigate("ExerciseDetail", { id: item.id })}
              />
            )}
            contentContainerStyle={[
              styles.list,
              { paddingBottom: insets.bottom + theme.spacing.lg },
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

      {/* Solo creazione: correggere ed eliminare vivono nel dettaglio
          dell'esercizio, che ha anche le preferenze e sa se la voce e'
          propria. */}
      <ExerciseFormSheet
        ref={formRef}
        onSaved={() => {
          reload();
          // Chi ha salvato ha finito: lasciare aperto un modulo gia' svuotato
          // sembra che il salvataggio non sia andato.
          formRef.current?.dismiss();
        }}
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
});
