import { Card } from "@/src/components/kal";
import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import { useTranslation } from "@/src/hooks/useTranslation";
import { theme } from "@/src/styles";
import type { RoutineRow } from "@/src/types/gym";
import { Check, Circle, Trash2 } from "lucide-react-native";
import React from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";

interface RoutineListItemProps {
  routine: RoutineRow;
  dayCount: number;
  onPress: () => void;
  onActivate: () => void;
  onDelete: () => void;
}

export const RoutineListItem: React.FC<RoutineListItemProps> = ({
  routine,
  dayCount,
  onPress,
  onActivate,
  onDelete,
}) => {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const active = routine.is_active === 1;

  return (
    <Card onPress={onPress} style={styles.card}>
      {/*
        L'interfaccia è monocroma: la scheda attiva si riconosce da un segno
        (la barra), dal peso del testo e dall'etichetta, non da un colore.
      */}
      {active ? (
        <View style={[styles.rail, { backgroundColor: colors.accent }]} />
      ) : null}

      <View style={styles.body}>
        <View style={styles.nameRow}>
          <Text
            style={[
              styles.name,
              { color: colors.text, fontWeight: active ? "700" : "500" },
            ]}
            numberOfLines={1}
          >
            {routine.name}
          </Text>
          {active ? (
            <View style={[styles.badge, { borderColor: colors.accent }]}>
              <Text style={[styles.badgeText, { color: colors.text }]}>
                {t("gym.active")}
              </Text>
            </View>
          ) : null}
        </View>
        <Text
          style={[styles.meta, { color: colors.textMuted }]}
          numberOfLines={1}
        >
          {t("gym.days_count", { count: dayCount })}
        </Text>
      </View>

      {active ? (
        <Check size={20} color={colors.text} />
      ) : (
        <TouchableOpacity onPress={onActivate} activeOpacity={0.6} hitSlop={8}>
          <Circle size={20} color={colors.textFaint} />
        </TouchableOpacity>
      )}

      <TouchableOpacity onPress={onDelete} activeOpacity={0.6} hitSlop={8}>
        <Trash2 size={18} color={colors.textFaint} />
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
  rail: {
    alignSelf: "stretch",
    width: 4,
    borderRadius: 2,
  },
  body: { flex: 1 },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  name: { flexShrink: 1, fontSize: 15 },
  badge: {
    borderWidth: 1,
    borderRadius: theme.radius.full,
    paddingHorizontal: 8,
    paddingVertical: 1,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  meta: { fontSize: 13, marginTop: 1 },
});
