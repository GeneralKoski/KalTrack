import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import { addDays, dayLabelKind } from "@/src/domain/date";
import { useTranslation } from "@/src/hooks/useTranslation";
import { theme } from "@/src/styles";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import React from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";

interface DayHeaderProps {
  date: string;
  today: string;
  onChange: (date: string) => void;
}

const MONTHS = [
  "gennaio",
  "febbraio",
  "marzo",
  "aprile",
  "maggio",
  "giugno",
  "luglio",
  "agosto",
  "settembre",
  "ottobre",
  "novembre",
  "dicembre",
];

/** Data estesa in italiano, senza dipendere dal locale del dispositivo. */
const formatLong = (iso: string): string => {
  const [year, month, day] = iso.split("-").map(Number);
  return `${day} ${MONTHS[month - 1]} ${year}`;
};

export const DayHeader: React.FC<DayHeaderProps> = ({
  date,
  today,
  onChange,
}) => {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const kind = dayLabelKind(date, today);
  const isFuture = date > today;

  return (
    <View style={styles.row}>
      <TouchableOpacity
        onPress={() => onChange(addDays(date, -1))}
        activeOpacity={0.6}
        hitSlop={12}
      >
        <ChevronLeft size={24} color={colors.text} />
      </TouchableOpacity>

      <View style={styles.center}>
        <Text style={[styles.label, { color: colors.text }]}>
          {kind === "other" ? formatLong(date) : t(`diary.day_${kind}`)}
        </Text>
        {kind !== "other" ? (
          <Text style={[styles.sub, { color: colors.textMuted }]}>
            {formatLong(date)}
          </Text>
        ) : null}
      </View>

      {/* Il futuro oltre domani non si registra: niente freccia avanti. */}
      <TouchableOpacity
        onPress={() => onChange(addDays(date, 1))}
        activeOpacity={0.6}
        hitSlop={12}
        disabled={isFuture}
      >
        <ChevronRight
          size={24}
          color={isFuture ? colors.textFaint : colors.text}
        />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  center: {
    alignItems: "center",
  },
  label: {
    fontSize: 18,
    fontWeight: "700",
  },
  sub: {
    fontSize: 12,
    marginTop: 1,
  },
});
