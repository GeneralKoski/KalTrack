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

/**
 * Riordino opzionale delle alternative.
 *
 * PUNTO DI INNESTO per `src/ai/rankAlternatives.ts`: il modulo non viene
 * importato qui di proposito, così lo sheet resta usabile senza campo e senza
 * AI. Chi monta lo sheet passa la funzione, e se non la passa vale l'ordine
 * locale di `suggestAlternatives`.
 */
export type RankAlternatives = (
  source: ExerciseRow,
  candidates: ExerciseRow[],
) => Promise<ExerciseRow[]>;

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
  const [rows, setRows] = useState<ExerciseRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!exercise) return;
    let active = true;
    setLoading(true);

    (async () => {
      try {
        const candidates = await suggestAlternatives(exercise.id, {
          onlyAvailableEquipment: onlyAvailable,
          limit: LIMIT,
        });
        // Se il riordino AI fallisce resta l'ordine locale: senza campo o senza
        // chiave l'elenco deve comunque comparire.
        const ordered = rank
          ? await rank(exercise, candidates).catch((error: unknown) => {
              logger.warn("[AlternativesSheet] riordino non riuscito", error);
              return candidates;
            })
          : candidates;
        if (active) setRows(ordered);
      } catch (error) {
        logger.error("[AlternativesSheet] errore caricamento", error);
        if (active) setRows([]);
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
      ) : rows.length === 0 ? (
        <EmptyState
          message={t("gym.no_alternatives")}
          icon={<Repeat2 size={40} color={colors.textFaint} />}
        />
      ) : (
        // map() e non FlatList: una lista virtualizzata dentro lo scroll dello
        // sheet annida due scroll e smette di ricevere gli eventi di tocco.
        <View style={styles.list}>
          {rows.map((row) => {
            const equipment = exerciseEquipment(row);
            return (
              <TouchableOpacity
                key={row.id}
                onPress={() => onPick(row)}
                activeOpacity={0.6}
                style={[styles.item, { borderColor: colors.border }]}
              >
                <View style={styles.itemBody}>
                  <Text
                    style={[styles.name, { color: colors.text }]}
                    numberOfLines={1}
                  >
                    {row.name}
                  </Text>
                  <Text
                    style={[styles.meta, { color: colors.textMuted }]}
                    numberOfLines={1}
                  >
                    {t(`gym.muscle.${row.muscle_group}`)}
                    {equipment.length > 0
                      ? ` · ${equipment.map((item) => t(`gym.equipment.${item}`)).join(", ")}`
                      : ""}
                  </Text>
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
  name: { fontSize: 15, fontWeight: "600" },
  meta: { fontSize: 12, marginTop: 1, textTransform: "capitalize" },
});
