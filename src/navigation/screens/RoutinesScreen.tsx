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
  reorderRoutines,
} from "@/src/db/queries/workouts";
import { movePosition } from "@/src/domain/reorder";
import { useFocusData } from "@/src/hooks/useFocusData";
import { useTranslation } from "@/src/hooks/useTranslation";
import { theme } from "@/src/styles";
import type { RoutineRow } from "@/src/types/gym";
import { logger } from "@/src/utils/logger";
import { showToast } from "@/src/utils/toast";
import { useNavigation } from "@react-navigation/native";
import * as Haptics from "expo-haptics";
import { ChevronLeft, ClipboardList, Plus } from "lucide-react-native";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { Gesture } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

/** Il numero di giorni si mostra in elenco, quindi va risolto qui. */
interface RoutineEntry {
  routine: RoutineRow;
  dayCount: number;
}

interface DraggableRoutineProps {
  entry: RoutineEntry;
  last: boolean;
  positions: SharedValue<Record<string, number>>;
  itemHeight: SharedValue<number>;
  count: number;
  onDragStateChange: (dragging: boolean) => void;
  onCommit: (order: Record<string, number>) => void;
  onPress: () => void;
  onActivate: () => void;
  onDelete: () => void;
}

/**
 * Una riga che si sposta col dito, come nei promemoria: le righe sono
 * posizionate in assoluto e ognuna legge la propria quota dallo shared value,
 * cosi' il trascinamento non ridisegna l'elenco a ogni pixel.
 */
function DraggableRoutine({
  entry,
  last,
  positions,
  itemHeight,
  count,
  onDragStateChange,
  onCommit,
  onPress,
  onActivate,
  onDelete,
}: DraggableRoutineProps) {
  const { colors, isDark } = useAppTheme();
  const id = entry.routine.id;
  const translateY = useSharedValue(
    (positions.value[id] ?? 0) * itemHeight.value,
  );
  const isDragging = useSharedValue(false);
  const startY = useSharedValue(0);
  const [dragging, setDragging] = useState(false);

  useAnimatedReaction(
    () => (positions.value[id] ?? 0) * itemHeight.value,
    (target, previous) => {
      if (isDragging.value) return;
      if (previous === null || previous === undefined) {
        translateY.value = target;
        return;
      }
      if (target === previous) return;
      translateY.value = withTiming(target, { duration: 180 });
    },
  );

  const handleDragStart = useCallback(() => {
    setDragging(true);
    onDragStateChange(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, [onDragStateChange]);

  const handleSwap = useCallback(() => {
    void Haptics.selectionAsync();
  }, []);

  const handleDragEnd = useCallback(
    (order: Record<string, number>) => {
      setDragging(false);
      onDragStateChange(false);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onCommit(order);
    },
    [onDragStateChange, onCommit],
  );

  const panGesture = Gesture.Pan()
    .activateAfterLongPress(220)
    .onStart(() => {
      isDragging.value = true;
      startY.value = translateY.value;
      runOnJS(handleDragStart)();
    })
    .onUpdate((e) => {
      translateY.value = startY.value + e.translationY;
      const current = positions.value[id] ?? 0;
      const slot = Math.round(translateY.value / itemHeight.value);
      const next = Math.max(0, Math.min(count - 1, slot));
      if (next !== current) {
        positions.value = movePosition(positions.value, current, next);
        runOnJS(handleSwap)();
      }
    })
    /*
      LO STATO SI CHIUDE QUI, NON NELLA CALLBACK DELL'ANIMAZIONE. Appenderla a
      `finished` vuol dire che un atterraggio interrotto - un secondo dito, un
      valore riscritto da fuori mentre la riga scende - lascia `isDragging` su
      true, lo scorrimento della pagina spento e il riordino mai scritto sul
      database: la schermata resta bloccata e l'ordine appena scelto si perde
      senza un segno. Il gesto e' finito nel momento in cui `onFinalize`
      scatta, e l'animazione e' solo il modo in cui la riga si posa.
    */
    .onFinalize(() => {
      if (!isDragging.value) return;
      isDragging.value = false;
      const order = positions.value;
      translateY.value = withTiming((order[id] ?? 0) * itemHeight.value, {
        duration: 160,
      });
      runOnJS(handleDragEnd)(order);
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: translateY.value },
      { scale: withTiming(isDragging.value ? 1.02 : 1, { duration: 150 }) },
    ],
    zIndex: isDragging.value ? 999 : 0,
    elevation: isDragging.value ? 12 : 0,
  }));

  return (
    /*
      La riga e' nuda in elenco, ma quella in mano prende uno sfondo: su fondo
      trasparente il trascinamento sembrerebbe una riga che si disallinea, non
      una che si solleva. Sfondo e raggio non cambiano l'altezza, quindi la
      riga non sussulta nel momento in cui la si prende.

      Quel che si muove e' TUTTA la riga, ma il gesto lo raccoglie il corpo:
      il `GestureDetector` sta dentro `RoutineListItem`, o una pressione lenta
      sul cerchio "attiva" o sul cestino diventerebbe un trascinamento invece
      di premere il bottone.
    */
    <Animated.View
      style={[
        styles.dragItem,
        dragging && [
          styles.draggingRow,
          {
            backgroundColor: colors.surface,
            shadowColor: theme.colors.black,
            shadowOpacity: isDark ? 0.7 : 0.25,
          },
        ],
        animatedStyle,
      ]}
    >
      <RoutineListItem
        routine={entry.routine}
        dayCount={entry.dayCount}
        dragGesture={panGesture}
        onPress={onPress}
        onActivate={onActivate}
        onDelete={onDelete}
      />
      {last || dragging ? null : (
        <View style={[styles.separator, { backgroundColor: colors.border }]} />
      )}
    </Animated.View>
  );
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

  // L'elenco mostrato e' una copia locale: un trascinamento lo riordina
  // subito, e la scrittura sul database arriva dopo.
  const [items, setItems] = useState<RoutineEntry[]>([]);
  const itemsRef = useRef<RoutineEntry[]>([]);
  const [dragging, setDragging] = useState(false);
  const [rowHeight, setRowHeight] = useState<number | null>(null);
  const positions = useSharedValue<Record<string, number>>({});
  const itemHeight = useSharedValue(0);

  useEffect(() => {
    if (data) {
      setItems(data);
      itemsRef.current = data;
    }
  }, [data]);

  useEffect(() => {
    const next: Record<string, number> = {};
    items.forEach((item, index) => {
      next[item.routine.id] = index;
    });
    positions.value = next;
  }, [items, positions]);

  const measureRow = useCallback(
    (height: number) => {
      if (height <= 0) return;
      itemHeight.value = height;
      setRowHeight(height);
    },
    [itemHeight],
  );

  const handleCommit = useCallback((order: Record<string, number>) => {
    const current = itemsRef.current;
    const ordered = [...current].sort(
      (a, b) => (order[a.routine.id] ?? 0) - (order[b.routine.id] ?? 0),
    );
    if (
      ordered.every(
        (item, index) => item.routine.id === current[index]?.routine.id,
      )
    ) {
      return;
    }

    itemsRef.current = ordered;
    setItems(ordered);
    reorderRoutines(ordered.map((item) => item.routine.id)).catch((error) => {
      logger.error("[RoutinesScreen] salvataggio riordinamento fallito", error);
    });
  }, []);

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
          /*
            Non e' una `FlatList`, e va contro la regola sugli elenchi lunghi:
            le schede sono due o tre, non duecento, e il trascinamento ha
            bisogno di tutte le righe montate insieme. Se un giorno diventassero
            tante, la virtualizzazione vince sul trascinamento.
          */
          <ScrollView
            scrollEnabled={!dragging}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[
              styles.list,
              { paddingBottom: insets.bottom + theme.spacing.lg },
            ]}
          >
            {items.length === 0 ? (
              <EmptyState
                message={t("gym.no_routines_hint")}
                icon={<ClipboardList size={40} color={colors.textFaint} />}
              />
            ) : (
              <>
                {/* Con una scheda sola non c'e' niente da riordinare. */}
                {items.length > 1 ? (
                  <Text style={[styles.hint, { color: colors.textMuted }]}>
                    {t("gym.reorder_hint")}
                  </Text>
                ) : null}

                {rowHeight === null ? (
                  /* Primo giro: le righe stanno nel flusso il tempo di
                     misurarne una, poi passano tutte in assoluto. */
                  items.map((item, index) => (
                    <View
                      key={item.routine.id}
                      onLayout={
                        index === 0
                          ? (e) => measureRow(e.nativeEvent.layout.height)
                          : undefined
                      }
                    >
                      <RoutineListItem
                        routine={item.routine}
                        dayCount={item.dayCount}
                        onPress={() =>
                          navigate("RoutineForm", { id: item.routine.id })
                        }
                        onActivate={() => onActivate(item.routine.id)}
                        onDelete={() => setPendingDelete(item.routine)}
                      />
                      {index < items.length - 1 ? (
                        <View
                          style={[
                            styles.separator,
                            { backgroundColor: colors.border },
                          ]}
                        />
                      ) : null}
                    </View>
                  ))
                ) : (
                  <View style={{ height: items.length * rowHeight }}>
                    {items.map((item, index) => (
                      <DraggableRoutine
                        key={item.routine.id}
                        entry={item}
                        last={index === items.length - 1}
                        positions={positions}
                        itemHeight={itemHeight}
                        count={items.length}
                        onDragStateChange={setDragging}
                        onCommit={handleCommit}
                        onPress={() =>
                          navigate("RoutineForm", { id: item.routine.id })
                        }
                        onActivate={() => onActivate(item.routine.id)}
                        onDelete={() => setPendingDelete(item.routine)}
                      />
                    ))}
                  </View>
                )}
              </>
            )}
          </ScrollView>
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
  hint: { fontSize: 13, paddingBottom: theme.spacing.xs },
  dragItem: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
  },
  draggingRow: {
    borderRadius: theme.radius.md,
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 14,
  },
  separator: { height: StyleSheet.hairlineWidth },
  loader: { marginTop: theme.spacing.xl },
});
