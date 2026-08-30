import { DfBottomSheet } from "@/src/components/DfBottomSheet";
import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import { dailyKcalRange, type DayKcal } from "@/src/db/queries/diary";
import { targetsUpTo } from "@/src/db/queries/settings";
import { listSteps } from "@/src/db/queries/tracking";
import {
  addMonths,
  EARLIEST_DAY,
  isWithinRange,
  latestDay,
  monthGrid,
  startOfMonth,
} from "@/src/domain/date";
import { EMPTY_NUTRIENTS } from "@/src/domain/nutrition";
import { targetAt } from "@/src/domain/targets";
import { DayRing } from "@/src/containers/diary/DayRing";
import { useTranslation } from "@/src/hooks/useTranslation";
import { theme } from "@/src/styles";
import type { TargetRow } from "@/src/types/nutrition";
import { logger } from "@/src/utils/logger";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import React, { forwardRef, useEffect, useState } from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";

const MESI = [
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

/** Lunedi' per primo, come la griglia. */
const GIORNI = ["L", "M", "M", "G", "V", "S", "D"];

const titoloMese = (iso: string): string => {
  const [year, month] = iso.split("-").map(Number);
  return `${MESI[month - 1]} ${year}`;
};

/** L'ultimo giorno del mese a cui appartiene la data. */
const ultimoDiMese = (iso: string): string => {
  const [year, month] = iso.split("-").map(Number);
  const giorni = new Date(year, month, 0).getDate();
  return `${iso.slice(0, 8)}${giorni}`;
};

interface DayPickerSheetProps {
  /** Il giorno attualmente aperto nella schermata. */
  date: string;
  today: string;
  onPick: (date: string) => void;
  /**
   * Cambia a ogni apertura, e fa rileggere gli anelli.
   *
   * Il foglio resta montato anche da chiuso, quindi senza questo leggerebbe il
   * database una volta sola all'avvio: chi aggiunge un pasto e poi apre il
   * calendario si vedrebbe un anello vuoto sul giorno che ha appena riempito.
   */
  refreshKey: number;
}

/**
 * Il calendario per spostarsi in fretta fra i giorni.
 *
 * Le frecce servono per il giorno prima e il giorno dopo; per andare a tre
 * settimane fa servirebbero ventuno tocchi, ed e' quello che questo evita.
 *
 * Ogni giorno porta il suo anello, con lo stesso linguaggio della home: si
 * vede com'e' andata prima di aprirla, e si sceglie dove andare guardando
 * invece che a memoria. I giorni futuri l'anello ce l'hanno vuoto - non c'e'
 * ancora niente - ma sono raggiungibili lo stesso, perche' e' li' che si
 * pianifica.
 */
export const DayPickerSheet = forwardRef<BottomSheetModal, DayPickerSheetProps>(
  ({ date, today, onPick, refreshKey }, ref) => {
    const { t } = useTranslation();
    const { colors } = useAppTheme();

    const [mese, setMese] = useState(() => startOfMonth(date));
    const [kcal, setKcal] = useState<Map<string, DayKcal>>(new Map());
    const [steps, setSteps] = useState<Map<string, number>>(new Map());
    const [targets, setTargets] = useState<TargetRow[]>([]);

    // Riaprendolo su un altro giorno, si riparte dal mese di quel giorno e non
    // da dove lo si era lasciato l'ultima volta.
    useEffect(() => setMese(startOfMonth(date)), [date]);

    useEffect(() => {
      let attivo = true;
      const settimane = monthGrid(mese);
      const giorni = settimane.flat().filter((d): d is string => d !== null);
      const primo = giorni[0];
      const ultimo = giorni[giorni.length - 1];

      (async () => {
        const [righe, passi, storia] = await Promise.all([
          dailyKcalRange(primo, ultimo),
          listSteps(primo, ultimo),
          targetsUpTo(ultimo),
        ]);
        if (!attivo) return;
        setKcal(new Map(righe.map((r) => [r.date, r])));
        setSteps(new Map(passi.map((p) => [p.date, p.steps])));
        setTargets(storia);
      })().catch((error) => {
        // Il calendario deve aprirsi comunque: senza gli anelli si sceglie
        // ancora un giorno, che e' quel che serve.
        logger.warn("[diario] anelli del calendario non caricati", error);
      });

      return () => {
        attivo = false;
      };
    }, [mese, refreshKey]);

    const settimane = monthGrid(mese);

    // Un mese si puo' aprire se ne contiene almeno un giorno raggiungibile.
    const indietro = addMonths(mese, -1);
    const avanti = addMonths(mese, 1);
    const puoIndietro = ultimoDiMese(indietro) >= EARLIEST_DAY;
    const puoAvanti = avanti <= latestDay(today);

    return (
      <DfBottomSheet ref={ref} title={t("diary.pick_day")}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => setMese(indietro)}
            activeOpacity={0.6}
            hitSlop={12}
            disabled={!puoIndietro}
          >
            <ChevronLeft
              size={22}
              color={puoIndietro ? colors.text : colors.textFaint}
            />
          </TouchableOpacity>

          <Text style={[styles.mese, { color: colors.text }]}>
            {titoloMese(mese)}
          </Text>

          <TouchableOpacity
            onPress={() => setMese(avanti)}
            activeOpacity={0.6}
            hitSlop={12}
            disabled={!puoAvanti}
          >
            <ChevronRight
              size={22}
              color={puoAvanti ? colors.text : colors.textFaint}
            />
          </TouchableOpacity>
        </View>

        <View style={styles.week}>
          {GIORNI.map((giorno, i) => (
            <Text
              key={`${giorno}-${i}`}
              style={[styles.weekDay, { color: colors.textMuted }]}
            >
              {giorno}
            </Text>
          ))}
        </View>

        {settimane.map((settimana, i) => (
          <View key={`w-${i}`} style={styles.week}>
            {settimana.map((giorno, j) => {
              if (giorno === null) {
                return <View key={`v-${j}`} style={styles.cell} />;
              }

              const dentro = isWithinRange(giorno, today);
              const riga = kcal.get(giorno);
              const obiettivo = targetAt(targets, giorno);

              return (
                <TouchableOpacity
                  key={giorno}
                  style={styles.cell}
                  activeOpacity={0.6}
                  disabled={!dentro}
                  onPress={() => onPick(giorno)}
                >
                  <DayRing
                    day={Number(giorno.slice(8))}
                    // Un giorno senza righe resta null e non zero: l'anello
                    // vuoto dice "non ho scritto", non "non ho mangiato".
                    consumed={
                      riga && riga.entries > 0
                        ? {
                            ...EMPTY_NUTRIENTS,
                            kcal: riga.kcal,
                            protein: riga.protein,
                            carbs: riga.carbs,
                            fat: riga.fat,
                          }
                        : null
                    }
                    target={obiettivo?.kcal ?? null}
                    selected={giorno === date}
                    today={giorno === today}
                    disabled={!dentro}
                    // Il puntino compare solo a obiettivo raggiunto: "quanti
                    // passi" non ci sta in questo spazio, "ce l'hai fatta" si.
                    stepsHit={
                      !!obiettivo?.steps &&
                      (steps.get(giorno) ?? 0) >= obiettivo.steps
                    }
                  />
                </TouchableOpacity>
              );
            })}
          </View>
        ))}

        <Text style={[styles.hint, { color: colors.textMuted }]}>
          {t("diary.pick_day_hint")}
        </Text>
      </DfBottomSheet>
    );
  },
);

DayPickerSheet.displayName = "DayPickerSheet";

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: theme.spacing.sm,
  },
  mese: { fontSize: 16, fontWeight: "700", textTransform: "capitalize" },
  week: { flexDirection: "row", justifyContent: "space-between" },
  weekDay: {
    flex: 1,
    textAlign: "center",
    fontSize: 11,
    fontWeight: "700",
    paddingBottom: 4,
  },
  /*
   * Altezza fissa e non dedotta dal contenuto: le settimane in fondo a un mese
   * corto sono caselle vuote, e senza un'altezza si accartoccerebbero a pochi
   * pixel - il calendario tornerebbe a cambiare misura da un mese all'altro,
   * che e' proprio quel che le sei settimane fisse servono a evitare.
   */
  cell: {
    flex: 1,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  hint: {
    fontSize: 12,
    lineHeight: 17,
    paddingTop: theme.spacing.sm,
  },
});
