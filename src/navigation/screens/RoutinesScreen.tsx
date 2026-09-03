import { DfAlert } from "@/src/components/DfAlert";
import { EmptyState, ScreenBackground } from "@/src/components/kal";
import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import { RoutineListItem } from "@/src/containers/gym/RoutineListItem";
import {
  activateRoutine,
  deleteRoutine,
  listRoutineDays,
  listRoutines,
} from "@/src/db/queries/workouts";
import { useFocusData } from "@/src/hooks/useFocusData";
import { useTranslation } from "@/src/hooks/useTranslation";
import { theme } from "@/src/styles";
import type { RoutineRow } from "@/src/types/gym";
import { showToast } from "@/src/utils/toast";
import { useNavigation } from "@react-navigation/native";
import { ChevronLeft, ClipboardList, Plus } from "lucide-react-native";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

/** Il numero di giorni si mostra in elenco, quindi va risolto qui. */
interface RoutineEntry {
  routine: RoutineRow;
  dayCount: number;
}

export function RoutinesScreen() {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  // Routines e RoutineForm non sono ancora in NavParams: finché non vengono
  // collegate allo stack, la navigazione passa dall'API non tipizzata.
  const navigate = navigation.navigate as unknown as (
    name: string,
    params?: object,
  ) => void;

  const [pendingDelete, setPendingDelete] = useState<RoutineRow | null>(null);

  const loader = useCallback(async (): Promise<RoutineEntry[]> => {
    const routines = await listRoutines();
    const entries: RoutineEntry[] = [];
    for (const routine of routines) {
      const days = await listRoutineDays(routine.id);
      entries.push({ routine, dayCount: days.length });
    }
    return entries;
  }, []);

  const { data, loading, reload } = useFocusData<RoutineEntry[]>(loader);

  const onActivate = async (id: string) => {
    await activateRoutine(id);
    reload();
  };

  const onDelete = async () => {
    if (!pendingDelete) return;
    await deleteRoutine(pendingDelete.id);
    setPendingDelete(null);
    showToast.success({ title: t("gym.routine_deleted") });
    reload();
  };

  return (
    <View style={styles.root}>
      <ScreenBackground />
      <SafeAreaView edges={["top", "left", "right"]} style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            activeOpacity={0.6}
            hitSlop={10}
          >
            <ChevronLeft size={26} color={colors.textSecondary} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
            {t("gym.routines")}
          </Text>
          <TouchableOpacity
            onPress={() =>
              // Prima scheda: si dichiara l'attrezzatura prima di costruirla,
              // o "genera con IA"/le alternative non hanno su cosa lavorare.
              // Con schede gia' esistenti l'attrezzatura si modifica dal
              // profilo, e "+" va dritto al modulo come sempre.
              (data ?? []).length === 0
                ? navigate("Equipment", { setupForRoutine: true })
                : navigate("RoutineForm")
            }
            // Finche' il primo caricamento non e' arrivato non si sa ancora
            // se ci sono gia' schede: senza questo un tocco troppo rapido
            // manderebbe chi ne ha gia' una a rifare l'attrezzatura da capo.
            disabled={loading && data === null}
            activeOpacity={0.6}
            hitSlop={10}
          >
            <Plus size={24} color={colors.text} />
          </TouchableOpacity>
        </View>

        {loading && !data ? (
          <ActivityIndicator style={styles.loader} color={colors.accent} />
        ) : (
          <FlatList
            data={data ?? []}
            keyExtractor={(item) => item.routine.id}
            renderItem={({ item }) => (
              <RoutineListItem
                routine={item.routine}
                dayCount={item.dayCount}
                onPress={() => navigate("RoutineForm", { id: item.routine.id })}
                onActivate={() => onActivate(item.routine.id)}
                onDelete={() => setPendingDelete(item.routine)}
              />
            )}
            contentContainerStyle={[
              styles.list,
              { paddingBottom: insets.bottom + theme.spacing.lg },
            ]}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            ListEmptyComponent={
              <EmptyState
                message={t("gym.no_routines_hint")}
                icon={<ClipboardList size={40} color={colors.textFaint} />}
              />
            }
          />
        )}
      </SafeAreaView>

      <DfAlert
        isOpen={pendingDelete !== null}
        title={t("gym.delete_routine_title")}
        message={t("gym.delete_routine_message")}
        confirmLabel={t("delete")}
        confirmColor={theme.colors.error}
        onConfirm={onDelete}
        onClose={() => setPendingDelete(null)}
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
  list: { paddingHorizontal: theme.spacing.md, paddingTop: theme.spacing.sm },
  separator: { height: theme.spacing.sm },
  loader: { marginTop: theme.spacing.xl },
});
