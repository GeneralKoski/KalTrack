import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import {
  addWater,
  getWaterTotal,
  removeLastWater,
} from "@/src/db/queries/wellbeing";
import { useFocusData } from "@/src/hooks/useFocusData";
import { useTranslation } from "@/src/hooks/useTranslation";
import { theme } from "@/src/styles";
import { formatDecimal, formatInteger } from "@/src/utils/number";
import { logger } from "@/src/utils/logger";
import { Droplet, Undo2 } from "lucide-react-native";
import React, { useCallback, useEffect, useState } from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";

/** I tre formati che coprono quasi tutto: bicchiere, lattina, bottiglietta. */
const GLASSES = [200, 330, 500];

interface WaterCardProps {
  date: string;
}

/**
 * Acqua del giorno. A differenza di peso e passi il valore si SOMMA: ogni tocco
 * aggiunge un bicchiere invece di sostituire la misura, quindi serve anche il
 * modo di togliere l'ultimo - un tocco di troppo capita, e aprire una lista per
 * correggerlo sarebbe sproporzionato.
 */
export const WaterCard: React.FC<WaterCardProps> = ({ date }) => {
  const { t } = useTranslation();
  const { colors } = useAppTheme();

  const load = useCallback(() => getWaterTotal(date), [date]);
  const { data, reload } = useFocusData(load);

  // Copia locale del totale: il tocco deve rispondere subito, senza aspettare
  // il giro di scrittura e rilettura sul database.
  const [total, setTotal] = useState<number | null>(null);
  useEffect(() => {
    setTotal(data);
  }, [data]);

  const add = async (ml: number) => {
    setTotal((prev) => (prev ?? 0) + ml);
    try {
      await addWater(date, ml);
    } catch (error) {
      logger.error("[WaterCard] errore aggiunta acqua", error);
    }
    reload();
  };

  const undo = async () => {
    // Quanto valesse l'ultimo bicchiere qui non si sa: niente stima ottimista,
    // il totale lo ridà il database.
    try {
      await removeLastWater(date);
    } catch (error) {
      logger.error("[WaterCard] errore annullamento bicchiere", error);
    }
    reload();
  };

  // Finché il totale non è caricato non è zero: è ancora ignoto.
  const known = total !== null;
  const liters = (total ?? 0) / 1000;

  return (
    /*
      Una riga sola, e non piu' una card.
      Era il riquadro piu' alto della schermata dopo il riepilogo - etichetta,
      valore e TRE pillole da 52 px l'una in verticale - per il dato meno
      importante di Oggi: pesava quanto le calorie della giornata. I tre
      formati restano tre tocchi, ma come chip in fondo alla stessa riga.
    */
    <View style={styles.row}>
      <Droplet size={17} color={colors.textMuted} />
      <Text style={[styles.label, { color: colors.textSecondary }]} numberOfLines={1}>
        {t("water.title")}
      </Text>

      {known ? (
        <Text style={[styles.value, { color: colors.text }]} numberOfLines={1}>
          {(total ?? 0) >= 1000
            ? formatDecimal(liters, 2)
            : formatInteger(total ?? 0)}
          <Text style={[styles.unit, { color: colors.textMuted }]}>
            {` ${(total ?? 0) >= 1000 ? t("water.liters") : t("water.ml")}`}
          </Text>
        </Text>
      ) : (
        <Text style={[styles.value, { color: colors.textFaint }]}>
          {t("water.unknown")}
        </Text>
      )}

      {known && (total ?? 0) > 0 ? (
        <TouchableOpacity
          onPress={undo}
          activeOpacity={0.6}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={t("water.undo")}
        >
          <Undo2 size={17} color={colors.textMuted} />
        </TouchableOpacity>
      ) : null}

      <View style={styles.glasses}>
        {GLASSES.map((ml) => (
          <TouchableOpacity
            key={ml}
            onPress={() => add(ml)}
            activeOpacity={0.6}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={t("water.add_ml", { ml })}
            style={[
              styles.glass,
              {
                backgroundColor: colors.surfaceMuted,
                borderColor: colors.border,
              },
            ]}
          >
            <Text
              style={[styles.glassLabel, { color: colors.textSecondary }]}
              numberOfLines={1}
            >
              {t("water.add_short", { ml })}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm + 1,
    paddingHorizontal: theme.spacing.xs,
  },
  label: { fontSize: 13, fontWeight: "500" },
  // Prende lo spazio in mezzo: cosi' i chip restano incollati a destra e non
  // ballano al variare della cifra.
  value: { flex: 1, fontSize: 14, fontWeight: "700" },
  unit: { fontSize: 11, fontWeight: "400" },
  glasses: {
    flexDirection: "row",
    gap: 6,
  },
  glass: {
    height: 30,
    paddingHorizontal: 11,
    borderRadius: theme.radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  glassLabel: { fontSize: 12, fontWeight: "600" },
});
