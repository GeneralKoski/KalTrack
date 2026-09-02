import { Card } from "@/src/components/kal";
import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import { useTranslation } from "@/src/hooks/useTranslation";
import { theme } from "@/src/styles";
import type { FoodInput } from "@/src/types/nutrition";
import { CloudDownload } from "lucide-react-native";
import React from "react";
import { StyleSheet, View } from "react-native";

interface OffResultItemProps {
  food: FoodInput;
  onPress: () => void;
}

/**
 * Un prodotto che sta nell'archivio e non nella libreria.
 *
 * Si distingue da `FoodListItem` per l'icona della nuvola e per l'assenza
 * della stella: non e' ancora una voce di questo telefono, quindi non c'e'
 * niente da mettere fra i preferiti. La nuvola e' la stessa metafora
 * dell'importazione dal catalogo negli esercizi.
 */
export const OffResultItem: React.FC<OffResultItemProps> = ({
  food,
  onPress,
}) => {
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const unit = food.isLiquid ? "ml" : "g";

  return (
    <Card onPress={onPress} style={styles.card}>
      <View
        style={[styles.icon, { backgroundColor: colors.surfaceMuted }]}
      >
        <CloudDownload size={20} color={colors.textFaint} />
      </View>

      <View style={styles.body}>
        <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
          {food.name}
        </Text>
        <Text
          style={[styles.brand, { color: colors.textMuted }]}
          numberOfLines={1}
        >
          {food.brand?.trim() || t("foods.off_no_brand")}
        </Text>
      </View>

      <View style={styles.right}>
        <Text style={[styles.kcal, { color: colors.textSecondary }]}>
          {Math.round(food.nutrients.kcal)} kcal
        </Text>
        <Text style={[styles.per, { color: colors.textFaint }]}>
          {t("foods.per_hundred", { unit })}
        </Text>
      </View>
    </Card>
  );
};

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: theme.radius.lg,
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
});
