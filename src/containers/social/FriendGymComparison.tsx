import type { SharedExercise } from "@/src/api/social";
import { ComparisonColumns } from "@/src/containers/social/ComparisonColumns";
import { dailyExerciseSummary } from "@/src/db/queries/workouts";
import { buildGymComparison, type Participant } from "@/src/domain/comparison";
import { useTranslation } from "@/src/hooks/useTranslation";
import { logger } from "@/src/utils/logger";
import React, { useEffect, useState } from "react";

interface Props {
  /** Il giorno dell'amico, per confrontare due giorni uguali e non due ore. */
  date: string;
  theirs: SharedExercise[];
}

/** Un numero che manca si scrive con un trattino, mai con uno zero. */
const numero = (v: number | null): string =>
  v === null ? "—" : Math.round(v).toLocaleString("it-IT");

const peso = (v: number | null): string =>
  v === null ? "—" : `${v.toLocaleString("it-IT")} kg`;

const vuoto = (handle: string, exercises: SharedExercise[]): Participant => ({
  handle,
  displayName: "",
  totals: { kcal: null, steps: null, workouts: null },
  shares: { calories: false, steps: false, workouts: false },
  exercises,
});

/**
 * La palestra di un amico accanto alla tua, per lo stesso giorno.
 *
 * Qui il vincitore c'e', a differenza delle calorie: volume e carico massimo
 * sono sport, e "di piu'" vuol dire davvero qualcosa. La regola sta in
 * `src/domain/comparison.ts` con le ragioni per esteso, e questa e' la stessa
 * funzione che usa la schermata del confronto a piu' persone.
 */
export const FriendGymComparison: React.FC<Props> = ({ date, theirs }) => {
  const { t } = useTranslation();
  const [mie, setMie] = useState<SharedExercise[] | null>(null);

  useEffect(() => {
    let attivo = true;
    dailyExerciseSummary(date)
      .then((righe) => {
        if (attivo) setMie(righe);
      })
      .catch((error) => {
        logger.warn("[social] i miei esercizi non letti", error);
        if (attivo) setMie([]);
      });
    return () => {
      attivo = false;
    };
  }, [date]);

  if (mie === null) return null;

  const righe = buildGymComparison(vuoto("io", mie), [
    vuoto("loro", theirs),
  ]).flatMap((riga) => [
    {
      key: `${riga.exercise}-vol`,
      label: `${riga.exercise} · ${t("social.compare_volume")}`,
      cells: riga.volume,
      format: numero,
    },
    {
      key: `${riga.exercise}-top`,
      label: `${riga.exercise} · ${t("social.compare_top_weight")}`,
      cells: riga.topWeight,
      format: peso,
    },
  ]);

  // Nessuno dei due si e' allenato quel giorno: una sezione vuota direbbe solo
  // che la sezione esiste.
  if (righe.length === 0) return null;

  return (
    <ComparisonColumns
      title={t("social.compare_gym")}
      people={[
        { handle: "io", displayName: t("social.you") },
        { handle: "loro", displayName: t("social.them") },
      ]}
      rows={righe}
    />
  );
};
