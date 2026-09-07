import { HistoryRow, ListGroup } from "@/src/components/kal";
import { useAppTheme } from "@/src/components/ThemeContext";
import { theme } from "@/src/styles";
import { Check } from "lucide-react-native";
import React from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";

export interface HistoryListItem {
  id: string;
  date: string;
  /** Già formattato con la sua unità: "80,0 kg", "8.412 passi". */
  value: string;
  /** Già formattato col segno, oppure il trattino della prima misura. */
  delta: string;
}

interface HistoryListProps {
  /** Nell'ordine in cui vanno disegnate: dalla più recente in giù. */
  items: HistoryListItem[];
  selected: Set<string>;
  onPress: (date: string) => void;
  onLongPress: (date: string) => void;
}

/**
 * L'elenco di uno storico: un blocco solo, righe separate da una linea.
 *
 * Sta qui e non dentro le due schermate perché peso e passi lo disegnavano
 * identico, riga per riga: le due copie divergevano a ogni ritocco fatto su
 * una sola delle due.
 */
export const HistoryList: React.FC<HistoryListProps> = ({
  items,
  selected,
  onPress,
  onLongPress,
}) => {
  const { colors } = useAppTheme();
  const selecting = selected.size > 0;

  return (
    // Le righe non hanno icona: senza il rientro a zero il separatore
    // comincerebbe in mezzo alla data.
    <ListGroup indent={theme.spacing.md}>
      {items.map((item) => {
        const isSelected = selected.has(item.date);
        return (
          <TouchableOpacity
            key={item.id}
            onPress={() => onPress(item.date)}
            onLongPress={() => onLongPress(item.date)}
            activeOpacity={0.6}
            style={styles.row}
          >
            <View style={styles.main}>
              <HistoryRow
                date={item.date}
                value={item.value}
                delta={item.delta}
              />
            </View>
            {selecting ? (
              <View
                style={[
                  styles.check,
                  isSelected
                    ? { backgroundColor: colors.accent }
                    : {
                        backgroundColor: "transparent",
                        borderWidth: 1,
                        borderColor: colors.border,
                      },
                ]}
              >
                {isSelected ? (
                  <Check size={14} color={colors.accentOn} />
                ) : null}
              </View>
            ) : null}
          </TouchableOpacity>
        );
      })}
    </ListGroup>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
  },
  main: { flex: 1 },
  check: {
    width: 22,
    height: 22,
    borderRadius: theme.radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
});
