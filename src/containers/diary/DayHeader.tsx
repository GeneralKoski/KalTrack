import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import {
  addDays,
  dayLabelKind,
  EARLIEST_DAY,
  latestDay,
} from "@/src/domain/date";
import { useTranslation } from "@/src/hooks/useTranslation";
import { formatLongDate } from "@/src/utils/dateUtils";
import { theme } from "@/src/styles";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import React from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";

interface DayHeaderProps {
  date: string;
  today: string;
  onChange: (date: string) => void;
  /** Apre il calendario. Il tocco sulla data e' la scorciatoia. */
  onOpenPicker: () => void;
}

/**
 * Altezza fissa, sempre.
 *
 * Il sottotitolo con la data estesa c'e' solo su oggi, ieri e domani, e con
 * un'altezza automatica la barra si alzava e si abbassava a ogni freccia: lo
 * spostamento fra due giorni sembrava un salto della schermata. Adesso lo
 * spazio e' riservato comunque e il contenuto sta in mezzo, quindi cambiare
 * giorno muove solo il testo.
 *
 * Erano 62 px per una data: la barra piu' alta dell'app dopo il riepilogo, in
 * cima alla schermata piu' densa. La riga resta una sola, e cede l'altezza in
 * eccesso al diario.
 */
const HEADER_HEIGHT = 50;

export const DayHeader: React.FC<DayHeaderProps> = ({
  date,
  today,
  onChange,
  onOpenPicker,
}) => {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const kind = dayLabelKind(date, today);

  /*
   * I limiti stanno nel dominio (`EARLIEST_DAY`, `latestDay`) e non qui: il
   * calendario deve spegnere le stesse caselle che queste frecce non
   * raggiungono, e due regole scritte in due posti divergono al primo cambio.
   */
  const puoIndietro = date > EARLIEST_DAY;
  const puoAvanti = date < latestDay(today);

  return (
    <View style={styles.row}>
      <TouchableOpacity
        onPress={() => onChange(addDays(date, -1))}
        activeOpacity={0.6}
        hitSlop={12}
        disabled={!puoIndietro}
      >
        <ChevronLeft
          size={22}
          color={puoIndietro ? colors.textSecondary : colors.textFaint}
        />
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.center}
        activeOpacity={0.6}
        onPress={onOpenPicker}
        accessibilityRole="button"
        accessibilityLabel={t("diary.pick_day")}
      >
        <Text style={[styles.label, { color: colors.text }]} numberOfLines={1}>
          {kind === "other" ? formatLongDate(date) : t(`diary.day_${kind}`)}
        </Text>
        {kind !== "other" ? (
          <Text
            style={[styles.sub, { color: colors.textMuted }]}
            numberOfLines={1}
          >
            {formatLongDate(date)}
          </Text>
        ) : null}
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() => onChange(addDays(date, 1))}
        activeOpacity={0.6}
        hitSlop={12}
        disabled={!puoAvanti}
      >
        <ChevronRight
          size={22}
          color={puoAvanti ? colors.textSecondary : colors.textFaint}
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
    // Altezza fissa invece del padding verticale: e' quel che impedisce alla
    // barra di cambiare misura quando il sottotitolo non c'e'.
    height: HEADER_HEIGHT,
  },
  center: {
    // Si restringe: con una data estesa ("13 settembre 2025") su schermo
    // stretto il blocco spingerebbe fuori le frecce.
    flexShrink: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    fontSize: 17,
    fontWeight: "700",
  },
  sub: {
    fontSize: 11,
  },
});
