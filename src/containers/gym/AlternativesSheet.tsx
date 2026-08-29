import { DfBottomSheet } from "@/src/components/DfBottomSheet";
import { Chip, EmptyState } from "@/src/components/kal";
import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import { suggestAlternatives } from "@/src/db/queries/exercises";
import { useTranslation } from "@/src/hooks/useTranslation";
import { theme } from "@/src/styles";
import { exerciseEquipment, type ExerciseRow } from "@/src/types/gym";
import { logger } from "@/src/utils/logger";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import { Repeat2 } from "lucide-react-native";
import React, { forwardRef, useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, TouchableOpacity, View } from "react-native";

const LIMIT = 12;

export interface AlternativeOption {
  exercise: ExerciseRow;
  /** Una riga sul perché sostituisce bene. Null quando l'ordine è quello locale. */
  reason: string | null;
}

/**
 * PUNTO DI INNESTO per il riordino AI (`src/ai/rankAlternatives.ts`).
 *
 * Il modulo non viene importato qui di proposito: lo sheet deve restare
 * utilizzabile senza campo, senza chiave e senza AI. Chi monta lo sheet passa
 * la funzione; se non la passa, o se questa fallisce, vale l'ordine locale di
 * `suggestAlternatives`.
 */
export type RankAlternatives = (args: {
  exerciseId: string;
  /** Lo stesso filtro scelto a schermo: l'AI non deve ignorarlo. */
  onlyAvailableEquipment: boolean;
}) => Promise<AlternativeOption[]>;

interface AlternativesSheetProps {
  /** Esercizio da sostituire. Null mentre lo sheet è chiuso. */
  exercise: ExerciseRow | null;
  onPick: (alternative: ExerciseRow) => void;
  rank?: RankAlternatives;
}

export const AlternativesSheet = forwardRef<
  BottomSheetModal,
  AlternativesSheetProps
>(({ exercise, onPick, rank }, ref) => {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [options, setOptions] = useState<AlternativeOption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!exercise) return;
    let active = true;
    setLoading(true);

    (async () => {
      try {
        const local = await suggestAlternatives(exercise.id, {
          onlyAvailableEquipment: onlyAvailable,
          limit: LIMIT,
        });
        const fallback: AlternativeOption[] = local.map((row) => ({
          exercise: row,
          reason: null,
        }));

        // Il riordino è un miglioramento, non un requisito: se non risponde o
        // torna vuoto resta l'elenco locale, che è già una risposta valida.
        let result = fallback;
        if (rank) {
          try {
            const ranked = await rank({
              exerciseId: exercise.id,
              onlyAvailableEquipment: onlyAvailable,
            });
            if (ranked.length > 0) result = ranked;
          } catch (error) {
            logger.warn("[AlternativesSheet] riordino non riuscito", error);
          }
        }
        if (active) setOptions(result);
      } catch (error) {
        logger.error("[AlternativesSheet] errore caricamento", error);
        if (active) setOptions([]);
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [exercise, onlyAvailable, rank]);

  return (
    <DfBottomSheet ref={ref} title={t("gym.alternatives")}>
      {exercise ? (
        <Text
          style={[styles.source, { color: colors.textMuted }]}
          numberOfLines={1}
        >
          {t("gym.replaces", { name: exercise.name })}
        </Text>
      ) : null}

      <View style={styles.filter}>
        <Chip
          label={t("gym.only_my_equipment")}
          active={onlyAvailable}
          onPress={() => setOnlyAvailable((value) => !value)}
          variant="primary"
        />
      </View>

      {loading ? (
        <ActivityIndicator style={styles.loader} color={colors.accent} />
      ) : options.length === 0 ? (
        <EmptyState
          message={t("gym.no_alternatives")}
          icon={<Repeat2 size={40} color={colors.textFaint} />}
        />
      ) : (
        // map() e non FlatList: una lista virtualizzata dentro lo scroll dello
        // sheet annida due scroll e smette di ricevere gli eventi di tocco.
        <View style={styles.list}>
          {options.map((option) => {
            const equipment = exerciseEquipment(option.exercise);
            return (
              <TouchableOpacity
                key={option.exercise.id}
                onPress={() => onPick(option.exercise)}
                activeOpacity={0.6}
                style={[styles.item, { borderColor: colors.border }]}
              >
                <View style={styles.itemBody}>
                  <Text
                    style={[styles.name, { color: colors.text }]}
                    numberOfLines={1}
                  >
                    {option.exercise.name}
                  </Text>
                  <Text
                    style={[styles.meta, { color: colors.textMuted }]}
                    numberOfLines={1}
                  >
                    {t(`gym.muscle.${option.exercise.muscle_group}`)}
                    {equipment.length > 0
                      ? ` · ${equipment.map((item) => t(`gym.equipment.${item}`)).join(", ")}`
                      : ""}
                  </Text>
                  {option.reason ? (
                    <Text
                      style={[styles.reason, { color: colors.textSecondary }]}
                      numberOfLines={2}
                    >
                      {option.reason}
                    </Text>
                  ) : null}
                </View>
                <Repeat2 size={18} color={colors.textFaint} />
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </DfBottomSheet>
  );
});

AlternativesSheet.displayName = "AlternativesSheet";

const styles = StyleSheet.create({
  source: { fontSize: 13, marginBottom: theme.spacing.sm },
  filter: { flexDirection: "row", marginBottom: theme.spacing.md },
  loader: { marginVertical: theme.spacing.xl },
  list: { gap: theme.spacing.sm },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    borderWidth: 1,
    borderRadius: theme.radius.lg,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  itemBody: { flex: 1 },
  name: { flexShrink: 1, fontSize: 15, fontWeight: "600" },
  meta: { flexShrink: 1, fontSize: 12, marginTop: 1, textTransform: "capitalize" },
  reason: { flexShrink: 1, fontSize: 12, marginTop: 4, lineHeight: 16 },
});
