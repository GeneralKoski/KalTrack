import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import { useTranslation } from "@/src/hooks/useTranslation";
import { theme } from "@/src/styles";
import type { RoutineRow } from "@/src/types/gym";
import { Check, Circle, Trash2 } from "lucide-react-native";
import React from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import {
  GestureDetector,
  type GestureType,
} from "react-native-gesture-handler";

interface RoutineListItemProps {
  routine: RoutineRow;
  dayCount: number;
  onPress: () => void;
  onActivate: () => void;
  onDelete: () => void;
  /**
   * Il gesto con cui la riga si sposta trascinandola, quando l'elenco e'
   * riordinabile. Copre il CORPO della riga e non i due bottoni in coda: vedi
   * la nota sotto.
   */
  dragGesture?: GestureType;
}

export const RoutineListItem: React.FC<RoutineListItemProps> = ({
  routine,
  dayCount,
  onPress,
  onActivate,
  onDelete,
  dragGesture,
}) => {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const active = routine.is_active === 1;

  /* Riga nuda, non card: vedi la nota in `ExerciseListItem`. */
  const body = (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.6}
      accessibilityRole="button"
      style={styles.pressable}
    >
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
    </TouchableOpacity>
  );

  return (
    <View style={styles.row}>
      {/*
        IL GESTO COPRE IL CORPO, NON TUTTA LA RIGA, e non e' un ripiego: un
        gesto che si attiva dopo 220 ms di pressione, steso sopra i due
        bersagli piu' piccoli della riga, trasforma una pressione lenta sul
        cerchio "attiva" o sul cestino in un trascinamento - e il bottone non
        parte. Un gesto non puo' attivarsi su una vista che non copre, quindi
        i due bottoni restano bottoni e si trascina prendendo la riga per il
        nome, che e' comunque la sua parte piu' larga.
      */}
      {dragGesture ? (
        <GestureDetector gesture={dragGesture}>{body}</GestureDetector>
      ) : (
        body
      )}

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
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm + 2,
    paddingVertical: 12,
    paddingHorizontal: theme.spacing.xs,
  },
  pressable: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm + 2,
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
