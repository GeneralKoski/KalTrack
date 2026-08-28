import { Card } from "@/src/components/kal";
import { Text } from "@/src/components/ui";
import { theme } from "@/src/styles";
import type { FoodRow } from "@/src/types/nutrition";
import { Star } from "lucide-react-native";
import React from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";

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
  const isFavorite = food.is_favorite === 1;
  const unit = food.is_liquid === 1 ? "ml" : "g";

  return (
    <Card onPress={onPress} style={styles.card}>
      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={1}>
          {food.name}
        </Text>
        {food.brand ? (
          <Text style={styles.brand} numberOfLines={1}>
            {food.brand}
          </Text>
        ) : null}
      </View>

      <View style={styles.right}>
        <Text style={styles.kcal}>{Math.round(food.kcal)} kcal</Text>
        <Text style={styles.per}>per 100 {unit}</Text>
      </View>

      <TouchableOpacity
        onPress={onToggleFavorite}
        activeOpacity={0.6}
        hitSlop={10}
        style={styles.star}
      >
        <Star
          size={20}
          color={isFavorite ? theme.colors.secondary : theme.colors.gray300}
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
  body: {
    flex: 1,
  },
  name: {
    fontSize: 15,
    fontWeight: "600",
    color: theme.colors.gray900,
  },
  brand: {
    fontSize: 13,
    color: theme.colors.gray500,
    marginTop: 1,
  },
  right: {
    alignItems: "flex-end",
  },
  kcal: {
    fontSize: 15,
    fontWeight: "600",
    color: theme.colors.gray800,
  },
  per: {
    fontSize: 11,
    color: theme.colors.gray400,
  },
  star: {
    paddingLeft: theme.spacing.xs,
  },
});
