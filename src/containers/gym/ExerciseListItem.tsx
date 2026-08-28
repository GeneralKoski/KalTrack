import { Card } from "@/src/components/kal";
import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import { useTranslation } from "@/src/hooks/useTranslation";
import { theme } from "@/src/styles";
import { exerciseEquipment, type ExerciseRow } from "@/src/types/gym";
import { Ban, ThumbsDown } from "lucide-react-native";
import React from "react";
import { StyleSheet, View } from "react-native";

interface ExerciseListItemProps {
  exercise: ExerciseRow;
  onPress: () => void;
}

export const ExerciseListItem: React.FC<ExerciseListItemProps> = ({
  exercise,
  onPress,
}) => {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const equipment = exerciseEquipment(exercise);

  return (
    <Card onPress={onPress} style={styles.card}>
      <View style={styles.body}>
        <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
          {exercise.name}
        </Text>
        <Text style={[styles.meta, { color: colors.textMuted }]} numberOfLines={1}>
          {t(`gym.muscle.${exercise.muscle_group}`)}
          {equipment.length > 0
            ? ` · ${equipment.map((e) => t(`gym.equipment.${e}`)).join(", ")}`
            : ""}
        </Text>
      </View>

      {/* Vietato e sgradito sono stati diversi: il primo esclude, il secondo declassa. */}
      {exercise.is_banned === 1 ? (
        <Ban size={18} color={theme.colors.error} />
      ) : exercise.dislike_level > 0 ? (
        <ThumbsDown size={18} color={colors.textFaint} />
      ) : null}
    </Card>
  );
};

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  body: { flex: 1 },
  name: { fontSize: 15, fontWeight: "600" },
  meta: { fontSize: 13, marginTop: 1, textTransform: "capitalize" },
});
