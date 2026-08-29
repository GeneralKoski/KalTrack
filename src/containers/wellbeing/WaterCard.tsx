import { Card, MetalSurface } from "@/src/components/kal";
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
    <Card style={styles.card}>
      <View style={styles.header}>
        <Droplet size={18} color={colors.textMuted} />
        <Text
          style={[styles.label, { color: colors.textMuted }]}
          numberOfLines={1}
        >
          {t("water.title")}
        </Text>
        {known && (total ?? 0) > 0 ? (
          <TouchableOpacity
            onPress={undo}
            activeOpacity={0.6}
            hitSlop={10}
            accessibilityLabel={t("water.undo")}
          >
            <Undo2 size={18} color={colors.textMuted} />
          </TouchableOpacity>
        ) : null}
      </View>

      {known ? (
        <View style={styles.valueRow}>
          <Text style={[styles.value, { color: colors.text }]}>
            {(total ?? 0) >= 1000
              ? liters.toLocaleString("it-IT", { maximumFractionDigits: 2 })
              : (total ?? 0).toLocaleString("it-IT")}
          </Text>
          <Text
            style={[styles.unit, { color: colors.textMuted }]}
            numberOfLines={1}
          >
            {(total ?? 0) >= 1000 ? t("water.liters") : t("water.ml")}
          </Text>
        </View>
      ) : (
        <Text style={[styles.empty, { color: colors.textFaint }]}>
          {t("water.unknown")}
        </Text>
      )}

      {/* Tre formati fissi: riga a larghezza piena, non una lista scorrevole. */}
      <View style={styles.glasses}>
        {GLASSES.map((ml) => (
          <TouchableOpacity
            key={ml}
            onPress={() => add(ml)}
            activeOpacity={0.6}
            style={styles.glass}
          >
            <MetalSurface radius={theme.radius.lg} style={styles.glassInner}>
              <Text
                style={[styles.glassLabel, { color: colors.text }]}
                numberOfLines={1}
              >
                {t("water.add_ml", { ml })}
              </Text>
            </MetalSurface>
          </TouchableOpacity>
        ))}
      </View>
    </Card>
  );
};

const styles = StyleSheet.create({
  card: { gap: 8 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  label: {
    flex: 1,
    flexShrink: 1,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  valueRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 4,
  },
  value: { fontSize: 22, fontWeight: "700" },
  unit: { flexShrink: 1, fontSize: 13, fontWeight: "500" },
  empty: { fontSize: 15, fontWeight: "500" },
  glasses: {
    flexDirection: "row",
    gap: theme.spacing.sm,
    marginTop: theme.spacing.xs,
  },
  glass: { flex: 1 },
  glassInner: {
    borderRadius: theme.radius.lg,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
  },
  glassLabel: { fontSize: 14, fontWeight: "600" },
});
