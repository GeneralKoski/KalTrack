import { Card, SectionLabel } from "@/src/components/kal";
import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import { getDayDiary } from "@/src/db/queries/diary";
import { getSteps } from "@/src/db/queries/tracking";
import { recentSessions } from "@/src/db/queries/workouts";
import {
  buildComparison,
  type ComparisonRow,
  type DayTotals,
} from "@/src/domain/comparison";
import { useTranslation } from "@/src/hooks/useTranslation";
import { theme } from "@/src/styles";
import { logger } from "@/src/utils/logger";
import React, { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

interface Props {
  /** Il giorno dell'amico, per confrontare due giorni uguali e non due ore. */
  date: string;
  theirs: DayTotals;
  shares: { calories: boolean; steps: boolean; workouts: boolean };
}

/** I miei numeri di quel giorno, letti dal database locale. */
async function myTotals(date: string): Promise<DayTotals> {
  const diary = await getDayDiary(date);
  const sessions = await recentSessions(50);
  return {
    /*
     * Zero calorie e nessun pasto registrato non sono la stessa cosa.
     *
     * Un diario vuoto totalizza zero, e mostrarlo come "0" accanto ai 2.400
     * dell'amico e' una bugia: non e' che oggi non ho mangiato, e' che non ho
     * ancora scritto niente. Il trattino lo dice.
     */
    kcal: diary.meals.length === 0 ? null : Math.round(diary.totals.kcal),
    steps: (await getSteps(date))?.steps ?? null,
    // Gli allenamenti invece uno zero ce l'hanno davvero: zero allenamenti
    // oggi e' un numero, non un dato mancante.
    workouts: sessions.filter((s) => s.date === date).length,
  };
}

/**
 * I tuoi numeri accanto ai suoi, per lo stesso giorno.
 *
 * Su passi e allenamenti dice chi e' davanti. Sulle calorie no, e non e' una
 * dimenticanza: mangiare piu' o meno di un'altra persona non e' meglio ne'
 * peggio, e un vincitore sarebbe un consiglio travestito da numero. Il peso
 * non compare proprio. La regola sta in `src/domain/comparison.ts`, con le
 * ragioni per esteso.
 */
export const FriendComparison: React.FC<Props> = ({ date, theirs, shares }) => {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const [righe, setRighe] = useState<ComparisonRow[] | null>(null);

  useEffect(() => {
    let attivo = true;
    myTotals(date)
      .then((miei) => {
        if (attivo) setRighe(buildComparison(miei, theirs, shares));
      })
      .catch((error) => {
        logger.warn("[social] confronto non calcolato", error);
        if (attivo) setRighe([]);
      });
    return () => {
      attivo = false;
    };
    // I totali dell'amico e le condivisioni arrivano insieme al profilo: la
    // data basta a distinguere un giorno dall'altro.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  if (!righe || righe.length === 0) return null;

  const etichetta: Record<ComparisonRow["metric"], string> = {
    kcal: t("social.share_calories"),
    steps: t("social.share_steps"),
    workouts: t("social.share_workouts"),
  };

  // Stesso formato del riquadro sopra: 7.200 e non 7200. Due modi di scrivere
  // lo stesso numero nella stessa schermata si notano.
  const numero = (v: number | null) =>
    v === null ? "—" : v.toLocaleString("it-IT");

  return (
    <>
      <SectionLabel style={styles.section}>
        {t("social.comparison")}
      </SectionLabel>
      <Card style={styles.card}>
        <View style={styles.headRow}>
          <View style={styles.metric} />
          <Text style={[styles.head, { color: colors.textMuted }]}>
            {t("social.you")}
          </Text>
          <Text style={[styles.head, { color: colors.textMuted }]}>
            {t("social.them")}
          </Text>
        </View>

        {righe.map((riga) => (
          <View key={riga.metric} style={styles.row}>
            <Text
              style={[styles.metricLabel, { color: colors.textMuted }]}
              numberOfLines={1}
            >
              {etichetta[riga.metric]}
            </Text>
            <Text
              style={[
                styles.value,
                {
                  color: riga.ahead === "mine" ? colors.accent : colors.text,
                  fontWeight: riga.ahead === "mine" ? "700" : "500",
                },
              ]}
            >
              {numero(riga.mine)}
            </Text>
            <Text
              style={[
                styles.value,
                {
                  color: riga.ahead === "theirs" ? colors.accent : colors.text,
                  fontWeight: riga.ahead === "theirs" ? "700" : "500",
                },
              ]}
            >
              {numero(riga.theirs)}
            </Text>
          </View>
        ))}
      </Card>
    </>
  );
};

const styles = StyleSheet.create({
  section: { marginTop: theme.spacing.md },
  card: { gap: theme.spacing.xs },
  headRow: { flexDirection: "row", alignItems: "center" },
  head: { flex: 1, fontSize: 11, fontWeight: "700", textAlign: "right", letterSpacing: 0.5 },
  metric: { flex: 2 },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 4 },
  metricLabel: { flex: 2, fontSize: 13 },
  value: { flex: 1, fontSize: 16, textAlign: "right" },
});
