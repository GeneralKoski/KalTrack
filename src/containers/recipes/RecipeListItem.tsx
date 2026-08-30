import { Card } from "@/src/components/kal";
import { SyncedPhoto } from "@/src/components/kal/SyncedPhoto";
import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import { useTranslation } from "@/src/hooks/useTranslation";
import { theme } from "@/src/styles";
import type { RecipeRow } from "@/src/types/nutrition";
import { CookingPot, Star } from "lucide-react-native";
import React from "react";
import { Image, StyleSheet, TouchableOpacity, View } from "react-native";

interface RecipeListItemProps {
  recipe: RecipeRow;
  kcalPerServing: number;
  ingredientCount: number;
  onPress: () => void;
  onToggleFavorite: () => void;
}

export const RecipeListItem: React.FC<RecipeListItemProps> = ({
  recipe,
  kcalPerServing,
  ingredientCount,
  onPress,
  onToggleFavorite,
}) => {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const isFavorite = recipe.is_favorite === 1;

  return (
    <Card onPress={onPress} style={styles.card}>
      {recipe.photo_uri ? (
        <SyncedPhoto uri={recipe.photo_uri} style={styles.photo} />
      ) : (
        <View
          style={[
            styles.photo,
            styles.photoEmpty,
            { backgroundColor: colors.surfaceMuted },
          ]}
        >
          <CookingPot size={22} color={colors.textFaint} />
        </View>
      )}

      <View style={styles.body}>
        <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
          {recipe.name}
        </Text>
        <Text style={[styles.meta, { color: colors.textMuted }]}>
          {t("recipes.ingredients_count", { count: ingredientCount })}
        </Text>
      </View>

      <View style={styles.right}>
        <Text style={[styles.kcal, { color: colors.textSecondary }]}>
          {Math.round(kcalPerServing)} kcal
        </Text>
        <Text style={[styles.per, { color: colors.textFaint }]}>
          {t("recipes.per_serving_short")}
        </Text>
      </View>

      <TouchableOpacity
        onPress={onToggleFavorite}
        activeOpacity={0.6}
        hitSlop={10}
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
    width: 48,
    height: 48,
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
  meta: {
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
});
