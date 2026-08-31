import * as social from "@/src/api/social";
import {
  Card,
  Chip,
  EmptyState,
  ScreenBackground,
  SectionLabel,
} from "@/src/components/kal";
import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import {
  ComparisonColumns,
  type ComparisonSectionRow,
} from "@/src/containers/social/ComparisonColumns";
import { dailyKcalRange } from "@/src/db/queries/diary";
import { stepsInRange } from "@/src/db/queries/tracking";
import {
  exerciseSummaryInRange,
  sessionCountInRange,
} from "@/src/db/queries/workouts";
import {
  buildGymComparison,
  buildMultiComparison,
  type Participant,
} from "@/src/domain/comparison";
import {
  addDays,
  EARLIEST_DAY,
  latestDay,
  todayIso,
} from "@/src/domain/date";
import { useAppNav } from "@/src/hooks/useAppNav";
import { useTranslation } from "@/src/hooks/useTranslation";
import { useAccountStore } from "@/src/stores/accountStore";
import { formatDate } from "@/src/utils/dateUtils";
import { theme } from "@/src/styles";
import { logger } from "@/src/utils/logger";
import { ChevronLeft, ChevronRight, Users } from "lucide-react-native";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * Quante persone si possono mettere accanto.
 *
 * Quattro piu' se stessi, come il server. Non e' un limite tecnico: cinque
 * colonne di numeri sono gia' il massimo che si legga su un telefono, e il
 * testo sotto la selezione lo dice invece di lasciarlo scoprire quando la
 * quinta spunta non risponde.
 */
const MAX_AMICI = 4;

/**
 * I periodi fra cui scegliere.
 *
 * Su piu' di un giorno passi e allenamenti si sommano e le calorie si fanno in
 * media: la somma delle calorie di una settimana confronterebbe chi ha scritto
 * di piu' invece di chi ha mangiato di piu'.
 */
const PERIODI = [1, 7, 30] as const;

/** Un numero che manca si scrive con un trattino, mai con uno zero. */
const numero = (v: number | null): string =>
  v === null ? "—" : Math.round(v).toLocaleString("it-IT");

const peso = (v: number | null): string =>
  v === null ? "—" : `${v.toLocaleString("it-IT")} kg`;

/**
 * I miei numeri del periodo, letti dal database locale.
 *
 * Dal telefono e non dal server: e' il telefono la fonte di verita', e la
 * copia sul server e' vecchia di un giro di sincronizzazione ogni volta che si
 * e' scritto qualcosa senza rete.
 *
 * L'aggregazione e' la STESSA che fa il server sui numeri degli altri
 * (`ComparisonController`): passi e allenamenti si sommano, le calorie si
 * fanno in media sui giorni registrati. Se le due colonne aggregassero in modo
 * diverso, il confronto sarebbe una finta.
 */
async function meStesso(from: string, to: string): Promise<Participant> {
  const giorni = await dailyKcalRange(from, to);
  const conCibo = giorni.filter((g) => g.entries > 0);

  return {
    handle: "__io__",
    displayName: "",
    totals: {
      // Un diario vuoto totalizza zero, e mostrarlo come "0" accanto ai 2.400
      // di un altro e' una bugia: non e' che non ho mangiato, e' che non ho
      // ancora scritto niente.
      kcal:
        conCibo.length === 0
          ? null
          : Math.round(
              conCibo.reduce((sum, g) => sum + g.kcal, 0) / conCibo.length,
            ),
      steps: await stepsInRange(from, to),
      workouts: await sessionCountInRange(from, to),
    },
    // Le mie condivisioni non c'entrano con quel che vedo di me stesso.
    shares: { calories: true, steps: true, workouts: true },
    exercises: await exerciseSummaryInRange(from, to),
  };
}

/**
 * I tuoi numeri accanto a quelli di un massimo di quattro amici.
 *
 * Le regole del confronto stanno in `src/domain/comparison.ts` e non qui: su
 * passi, allenamenti e palestra c'e' chi sta davanti, sulle calorie no, il
 * peso non compare. Questa schermata le disegna e non le decide.
 */
export function ComparisonScreen() {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { goBack } = useAppNav();
  const profile = useAccountStore((s) => s.profile);

  const [amici, setAmici] = useState<social.Friendship[]>([]);
  const [scelti, setScelti] = useState<string[]>([]);
  const [io, setIo] = useState<Participant | null>(null);
  const [altri, setAltri] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(false);

  const today = todayIso();
  const [date, setDate] = useState(today);
  const [days, setDays] = useState(1);

  // Il primo giorno del periodo: con `days` a uno e' il giorno stesso.
  const from = addDays(date, -(days - 1));

  useEffect(() => {
    social
      .listFriendships()
      .then((righe) => setAmici(righe.filter((f) => f.status === "accepted")))
      .catch((error) => logger.warn("[social] amici non letti", error));
  }, []);

  useEffect(() => {
    meStesso(from, date)
      .then(setIo)
      .catch((error) => logger.warn("[social] i miei numeri non letti", error));
  }, [from, date]);

  const carica = useCallback(
    async (handles: string[]) => {
      if (handles.length === 0) {
        setAltri([]);
        return;
      }
      setLoading(true);
      try {
        const risposta = await social.fetchComparison(handles, date, days);
        setAltri(
          risposta.participants.map((p) => ({
            handle: p.handle,
            displayName: p.displayName,
            totals: p.totals,
            shares: {
              calories: p.shares.calories,
              steps: p.shares.steps,
              workouts: p.shares.workouts,
            },
            // Il server manda gia' la lista vuota a chi non condivide la
            // palestra: qui non si rifiltra, si disegna.
            exercises: p.exercises,
          })),
        );
      } catch (error) {
        logger.warn("[social] confronto non riuscito", error);
        setAltri([]);
      } finally {
        setLoading(false);
      }
    },
    [date, days],
  );

  // Cambiando giorno vanno riletti anche i loro numeri, non solo i miei.
  useEffect(() => {
    void carica(scelti);
    // `scelti` non e' fra le dipendenze apposta: chi tocca una spunta chiama
    // gia' `carica`, e rimetterlo qui farebbe partire due richieste per ogni
    // tocco.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, days, carica]);

  const scegli = (handle: string) => {
    const prossimi = scelti.includes(handle)
      ? scelti.filter((h) => h !== handle)
      : scelti.length >= MAX_AMICI
        ? scelti
        : [...scelti, handle];

    setScelti(prossimi);
    void carica(prossimi);
  };

  const colonne = io
    ? [
        { handle: io.handle, displayName: t("social.you") },
        ...altri.map((p) => ({
          handle: p.handle,
          displayName: p.displayName,
        })),
      ]
    : [];

  const etichetta: Record<string, string> = {
    kcal: t("social.share_calories"),
    steps: t("social.share_steps"),
    workouts: t("social.share_workouts"),
  };

  const righeTotali: ComparisonSectionRow[] =
    io && altri.length > 0
      ? buildMultiComparison(io, altri).map((riga) => ({
          key: riga.metric,
          label: etichetta[riga.metric],
          cells: riga.cells,
          format: numero,
        }))
      : [];

  /*
   * La palestra e' una sezione a parte e non altre righe qui sotto: "quante
   * calorie" e "quanto hai spinto in panca" sono due domande diverse, e
   * infilarle nella stessa tabella le farebbe leggere come una sola.
   */
  const righeGym: ComparisonSectionRow[] =
    io && altri.length > 0
      ? buildGymComparison(io, altri).flatMap((riga) => [
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
        ])
      : [];

  return (
    <View style={styles.root}>
      <ScreenBackground />
      <SafeAreaView edges={["top", "left", "right"]} style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity onPress={goBack} activeOpacity={0.6} hitSlop={8}>
            <ChevronLeft size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.text }]}>
            {t("social.compare_title")}
          </Text>
          <View style={styles.spacer} />
        </View>

        {/*
          Gli stessi limiti del diario, e per la stessa ragione: un confronto
          su un giorno che nell'app non si puo' nemmeno aprire non serve a
          niente.
        */}
        <View style={styles.dayRow}>
          <TouchableOpacity
            onPress={() => setDate(addDays(date, -1))}
            activeOpacity={0.6}
            hitSlop={12}
            disabled={date <= EARLIEST_DAY}
          >
            <ChevronLeft
              size={22}
              color={date > EARLIEST_DAY ? colors.text : colors.textFaint}
            />
          </TouchableOpacity>
          <Text style={[styles.day, { color: colors.text }]}>
            {date === today ? t("diary.day_today") : formatDate(date)}
          </Text>
          <TouchableOpacity
            onPress={() => setDate(addDays(date, 1))}
            activeOpacity={0.6}
            hitSlop={12}
            disabled={date >= latestDay(today)}
          >
            <ChevronRight
              size={22}
              color={date < latestDay(today) ? colors.text : colors.textFaint}
            />
          </TouchableOpacity>
        </View>

        <View style={styles.chips}>
          {PERIODI.map((giorni) => (
            <Chip
              key={giorni}
              label={
                giorni === 1
                  ? t("social.period_day")
                  : t("social.window_days", { count: giorni })
              }
              active={days === giorni}
              onPress={() => setDays(giorni)}
            />
          ))}
        </View>

        {/*
          Va detto cosa vuol dire un periodo: senza, "12.400 passi" su sette
          giorni si legge come la giornata di ieri.
        */}
        {days > 1 ? (
          <Text style={[styles.periodHint, { color: colors.textMuted }]}>
            {t("social.compare_period_hint")}
          </Text>
        ) : null}

        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + theme.spacing.lg },
          ]}
        >
          <SectionLabel>{t("social.compare_pick")}</SectionLabel>
          <Card style={styles.picker}>
            {amici.length === 0 ? (
              <Text style={[styles.hint, { color: colors.textMuted }]}>
                {t("social.no_friends")}
              </Text>
            ) : (
              <>
                <View style={styles.chips}>
                  {amici.map((amico) => {
                    const handle = amico.user?.handle ?? "";
                    return (
                      <Chip
                        key={amico.id}
                        label={amico.user?.displayName ?? handle}
                        active={scelti.includes(handle)}
                        onPress={() => scegli(handle)}
                      />
                    );
                  })}
                </View>
                {/* Il limite si spiega, non si subisce: una spunta che non
                    risponde senza dire perche' sembra un difetto. */}
                <Text style={[styles.hint, { color: colors.textMuted }]}>
                  {t("social.compare_limit")}
                </Text>
              </>
            )}
          </Card>

          {loading ? <ActivityIndicator color={colors.accent} /> : null}

          {scelti.length === 0 ? (
            <EmptyState
              icon={<Users size={40} color={colors.textFaint} />}
              message={t("social.compare_empty")}
            />
          ) : (
            <>
              <ComparisonColumns
                title={t("social.compare_totals")}
                people={colonne}
                rows={righeTotali}
                empty={t("social.shares_nothing")}
              />
              <ComparisonColumns
                title={t("social.compare_gym")}
                people={colonne}
                rows={righeGym}
                empty={t("social.compare_no_gym")}
              />
            </>
          )}

          {profile ? null : (
            <Text style={[styles.hint, { color: colors.textMuted }]}>
              {t("social.no_backend")}
            </Text>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: theme.spacing.md,
    height: 52,
  },
  title: { flex: 1, fontSize: 18, fontWeight: "700", textAlign: "center" },
  spacer: { width: 24 },
  content: { paddingHorizontal: theme.spacing.md, gap: theme.spacing.sm },
  dayRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.spacing.md,
    height: 40,
  },
  day: { fontSize: 15, fontWeight: "600" },
  periodHint: {
    fontSize: 12,
    lineHeight: 17,
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.xs,
  },
  picker: { gap: theme.spacing.sm },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.xs,
  },
  hint: { fontSize: 13, lineHeight: 18 },
});
