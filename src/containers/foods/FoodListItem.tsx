import { Card } from "@/src/components/kal";
import { SyncedPhoto } from "@/src/components/kal/SyncedPhoto";
import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import { theme } from "@/src/styles";
import type { FoodRow } from "@/src/types/nutrition";
import { Salad, Star } from "lucide-react-native";
import React from "react";
import { Image, StyleSheet, TouchableOpacity, View } from "react-native";

interface FoodListItemProps {
  food: FoodRow;
  onPress: () => void;
  onToggleFavorite: () => void;
}

export const FoodListItem: React.FC<FoodListItemProps> = ({
  food,
  onPress,
  onToggleFavorite,
}) => {
  const { colors } = useAppTheme();
  const isFavorite = food.is_favorite === 1;
  const unit = food.is_liquid === 1 ? "ml" : "g";

  return (
    <Card onPress={onPress} style={styles.card}>
      {food.image_uri ? (
        <SyncedPhoto uri={food.image_uri} style={styles.photo} />
      ) : (
        <View
          style={[
            styles.photo,
            styles.photoEmpty,
            { backgroundColor: colors.surfaceMuted },
          ]}
        >
          <Salad size={20} color={colors.textFaint} />
        </View>
      )}

      <View style={styles.body}>
        <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
          {food.name}
        </Text>
        {food.brand ? (
          <Text
            style={[styles.brand, { color: colors.textMuted }]}
            numberOfLines={1}
          >
            {food.brand}
          </Text>
        ) : null}
      </View>

      <View style={styles.right}>
        <Text style={[styles.kcal, { color: colors.textSecondary }]}>
          {Math.round(food.kcal)} kcal
        </Text>
        <Text style={[styles.per, { color: colors.textFaint }]}>
          per 100 {unit}
        </Text>
      </View>

      <TouchableOpacity
        onPress={onToggleFavorite}
        activeOpacity={0.6}
        hitSlop={10}
        style={styles.star}
      >
        <Star
          size={20}
          color={isFavorite ? theme.colors.secondary : colors.textFaint}
          fill={isFavorite ? theme.colors.secondary : "transparent"}
        />
      </TouchableOpacity>
    </Card>
  );
};

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  photo: {
    width: 44,
    height: 44,
    borderRadius: theme.radius.lg,
  },
  photoEmpty: {
    alignItems: "center",
    justifyContent: "center",
  },
  body: {
    flex: 1,
  },
  name: {
    fontSize: 15,
    fontWeight: "600",
  },
  brand: {
    fontSize: 13,
    marginTop: 1,
  },
  right: {
    alignItems: "flex-end",
  },
  kcal: {
    fontSize: 15,
    fontWeight: "600",
  },
  per: {
    fontSize: 11,
  },
  star: {
    paddingLeft: theme.spacing.xs,
  },
});
