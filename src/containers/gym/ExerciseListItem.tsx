import { SyncedPhoto } from "@/src/components/kal/SyncedPhoto";
import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import { useTaxonomyStore } from "@/src/stores/taxonomyStore";
import { theme } from "@/src/styles";
import { exerciseEquipment, type ExerciseRow } from "@/src/types/gym";
import { Ban, Dumbbell, ThumbsDown } from "lucide-react-native";
import React from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";

interface ExerciseListItemProps {
  exercise: ExerciseRow;
  onPress: () => void;
}

export const ExerciseListItem: React.FC<ExerciseListItemProps> = ({
  exercise,
  onPress,
}) => {
  const { colors } = useAppTheme();
  const muscleLabel = useTaxonomyStore((s) => s.muscleLabel);
  const equipmentLabel = useTaxonomyStore((s) => s.equipmentLabel);
  const equipment = exerciseEquipment(exercise);

  return (
    /* Una riga nuda, non una card: duecento esercizi in card da 76 px ne
       facevano stare otto per schermata. Senza cornice e con la miniatura a 40
       la riga sta in 60, e l'elenco si scorre invece di scandagliarsi. */
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.6}
      accessibilityRole="button"
      style={styles.row}
    >
      {/* Stessa miniatura di `FoodListItem`: `SyncedPhoto` quando c'e', o un
          quadrato col manubrio. La colonna `photo_uri` (migrazione 18) era
          scritta dal modulo e letta solo dal dettaglio, quindi chi aggiungeva
          una foto tornava a un elenco identico a prima. */}
      {exercise.photo_uri ? (
        <SyncedPhoto uri={exercise.photo_uri} style={styles.photo} />
      ) : (
        <View
          style={[
            styles.photo,
            styles.photoEmpty,
            { backgroundColor: colors.surfaceMuted },
          ]}
        >
          <Dumbbell size={20} color={colors.textFaint} />
        </View>
      )}

      <View style={styles.body}>
        <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
          {exercise.name}
        </Text>
        <Text style={[styles.meta, { color: colors.textMuted }]} numberOfLines={1}>
          {muscleLabel(exercise.muscle_group)}
          {equipment.length > 0
            ? ` · ${equipment.map(equipmentLabel).join(", ")}`
            : ""}
        </Text>
      </View>

      {/* Vietato e sgradito sono stati diversi: il primo esclude, il secondo declassa. */}
      {exercise.is_banned === 1 ? (
        <Ban size={18} color={theme.colors.error} />
      ) : exercise.dislike_level > 0 ? (
        <ThumbsDown size={18} color={colors.textFaint} />
      ) : null}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm + 2,
    paddingVertical: 10,
    paddingHorizontal: theme.spacing.xs,
  },
  photo: { width: 40, height: 40, borderRadius: theme.radius.md },
  photoEmpty: { alignItems: "center", justifyContent: "center" },
  body: { flex: 1 },
  name: { fontSize: 15, fontWeight: "500" },
  meta: { fontSize: 12, marginTop: 1, textTransform: "capitalize" },
});
