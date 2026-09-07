import { DfAlert } from "@/src/components/DfAlert";
import { DfButton } from "@/src/components/form/DfButton";
import { FormScreen } from "@/src/components/FormScreen";
import {
  Card,
  EmptyState,
  HeroPanel,
  ScreenBackground,
  SectionLabel,
} from "@/src/components/kal";
import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import { AlternativesSheet } from "@/src/containers/gym/AlternativesSheet";
import { RestTimer } from "@/src/containers/gym/RestTimer";
import { SetHeader, SetRow } from "@/src/containers/gym/SetRow";
import {
  endSession,
  getRoutineDay,
  lastSetsFor,
  deleteSet,
  loggedSetsOf,
  logSet,
  personalBest,
  sessionStartedAt,
  startSession,
  type PersonalBest,
  type ResolvedBlock,
  type ResolvedDay,
} from "@/src/db/queries/workouts";
import { todayIso } from "@/src/domain/date";
import { matchLoggedSets } from "@/src/domain/session";
import { suggestNextWeight } from "@/src/domain/strength";
import { useAppNav } from "@/src/hooks/useAppNav";
import { useTranslation } from "@/src/hooks/useTranslation";
import { theme } from "@/src/styles";
import type { ExerciseRow, SessionSetRow } from "@/src/types/gym";
import { rankAlternatives } from "@/src/ai/rankAlternatives";
import { logger } from "@/src/utils/logger";
import { showToast } from "@/src/utils/toast";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import { useRoute, type RouteProp } from "@react-navigation/native";
import { ChevronLeft, Dumbbell, Repeat2 } from "lucide-react-native";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

/** Quando la scheda non dice quante serie fare, tre è la risposta meno sbagliata. */
const DEFAULT_SETS = 3;
const DEFAULT_REST_SECONDS = 90;
/** Il salto più piccolo possibile con i dischi di una palestra normale. */
const WEIGHT_INCREMENT_KG = 2.5;
/** Spazio lasciato sotto la lista perché il timer non copra l'ultima serie. */
const TIMER_CLEARANCE = 110;

type SessionRoute = RouteProp<
  { params: { routineId: string; dayIndex: number } },
  "params"
>;

interface ExerciseInfo {
  lastSets: SessionSetRow[];
  best: PersonalBest | null;
}

interface SetValues {
  weight: string;
  reps: string;
}

/** Una serie nell'ordine in cui va eseguita, non nell'ordine in cui è scritta. */
interface PlannedSet {
  key: string;
  blockId: string;
  blockExerciseId: string;
  exercise: ExerciseRow;
  setIndex: number;
  round: number;
  /**
   * Vero quando questa serie chiude il giro.
   *
   * In un superset il recupero va DOPO il giro, non fra i due esercizi:
   * riposare fra A e B è esattamente ciò che il superset serve a evitare.
   */
  closesRound: boolean;
}

const formatNumber = (value: number): string =>
  Number.isInteger(value) ? String(value) : String(value).replace(".", ",");

const parseNumber = (text: string): number | null => {
  const parsed = Number(text.replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

/** Da "8-10" o "10 per lato" si tiene il primo numero: è il target minimo. */
const parseFirstInt = (text: string | null): number | null => {
  if (!text) return null;
  const match = /\d+/.exec(text);
  return match ? Number(match[0]) : null;
};

const heaviestSet = (sets: SessionSetRow[]): SessionSetRow | null =>
  sets.reduce<SessionSetRow | null>(
    (best, row) =>
      row.weight !== null && (best === null || row.weight > (best.weight ?? 0))
        ? row
        : best,
    null,
  );

/**
 * L'ordine di esecuzione delle serie di un blocco.
 *
 * In superset e circuito si alternano gli esercizi giro per giro: presentarli
 * uno dopo l'altro sarebbe un altro allenamento, non una resa grafica diversa.
 */
function planBlock(
  block: ResolvedBlock,
  resolve: (blockExerciseId: string, fallback: ExerciseRow) => ExerciseRow,
): PlannedSet[] {
  const entries = block.exercises.map((item) => ({
    id: item.row.id,
    exercise: resolve(item.row.id, item.exercise),
    sets: item.row.target_sets ?? DEFAULT_SETS,
  }));

  const planned: PlannedSet[] = [];
  const push = (
    entry: (typeof entries)[number],
    setIndex: number,
    round: number,
  ) => {
    planned.push({
      key: `${block.block.id}:${entry.id}:${setIndex}`,
      blockId: block.block.id,
      blockExerciseId: entry.id,
      exercise: entry.exercise,
      setIndex,
      round,
      // Riempito sotto: dipende da quali altre serie compongono il giro.
      closesRound: true,
    });
  };

  const interleaved = block.kind === "superset" || block.kind === "circuit";
  if (interleaved) {
    const rounds = Math.max(...entries.map((entry) => entry.sets), 0);
    for (let round = 0; round < rounds; round++) {
      const inRound = entries.filter((entry) => round < entry.sets);
      inRound.forEach((entry, index) => {
        push(entry, round, round);
        // Solo l'ultima serie del giro fa scattare il recupero: fra gli
        // esercizi di un superset non si riposa, è il senso del blocco.
        planned[planned.length - 1].closesRound = index === inRound.length - 1;
      });
    }
    return planned;
  }

  for (const entry of entries) {
    for (let setIndex = 0; setIndex < entry.sets; setIndex++) {
      push(entry, setIndex, setIndex);
    }
  }
  return planned;
}

export function SessionScreen() {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const { goBack, navigate } = useAppNav();
  const insets = useSafeAreaInsets();
  const route = useRoute<SessionRoute>();
  const { routineId, dayIndex } = route.params;

  const [day, setDay] = useState<ResolvedDay | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  /** Ora d'inizio dell'allenamento, per il cronometro in cima. */
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [infos, setInfos] = useState<Record<string, ExerciseInfo>>({});
  const [values, setValues] = useState<Record<string, SetValues>>({});
  /**
   * Chiave della riga -> id della serie scritta. Sostituisce un `done`
   * booleano: l'id serve a disfare la serie, e due stati separati potevano
   * discordare - una riga spuntata di cui non si sapeva piu' cosa cancellare.
   */
  const [logged, setLogged] = useState<Record<string, string>>({});
  /** Serie in corso di scrittura: impedisce il doppio invio da doppio tocco. */
  const inFlight = useRef<Set<string>>(new Set());

  /**
   * Riordino AI delle alternative. Memoizzato: `rank` è nelle dipendenze
   * dell'effetto dello sheet, e una callback ricreata a ogni render farebbe
   * partire una chiamata al modello ogni volta che la schermata si aggiorna,
   * cioè a ogni serie spuntata.
   */
  const rankWithAi = useCallback(
    (args: { exerciseId: string; onlyAvailableEquipment: boolean }) =>
      rankAlternatives(args),
    [],
  );
  const [substitutions, setSubstitutions] = useState<
    Record<string, ExerciseRow>
  >({});
  const [rest, setRest] = useState<{ key: string; seconds: number } | null>(
    null,
  );
  const [confirmFinish, setConfirmFinish] = useState(false);

  /*
    Quante serie sono fatte e quante ne restano.
    In palestra, fra una serie e l'altra, la domanda e' "quanto manca" - e la
    schermata non la rispondeva in nessun modo: si scorreva per contare i
    tondi spuntati. Il totale esce dallo stesso `planBlock` che disegna le
    righe, quindi non puo' divergere da quel che si vede.
  */
  /*
    Il cronometro dell'allenamento.
    L'altra meta' della domanda che ci si fa fra una serie e l'altra: non solo
    "quanto manca" ma "da quanto sono qui". `startSession` riapre la sessione
    lasciata a meta', quindi riprendendo un allenamento il tempo riparte da
    quando e' cominciato davvero e non da quando si e' rientrati.

    Un tick al secondo e non `Date.now()` a ogni render: il render qui lo
    scatena ogni tasto scritto in un campo, e il tempo deve avanzare anche
    mentre non si tocca niente.
  */
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!startedAt) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [startedAt]);

  const elapsed = useMemo(() => {
    if (!startedAt) return null;
    const seconds = Math.max(0, Math.floor((now - Date.parse(startedAt)) / 1000));
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const rest = seconds % 60;
    const pad = (value: number) => String(value).padStart(2, "0");
    return hours > 0
      ? `${hours}:${pad(minutes)}:${pad(rest)}`
      : `${minutes}:${pad(rest)}`;
  }, [startedAt, now]);

  const totalSets = useMemo(
    () =>
      (day?.blocks ?? []).reduce(
        (sum, block) =>
          sum + planBlock(block, (_id, fallback) => fallback).length,
        0,
      ),
    [day],
  );
  const doneSets = Object.keys(logged).length;
  const [replacing, setReplacing] = useState<{
    blockExerciseId: string;
    exercise: ExerciseRow;
  } | null>(null);

  const sheetRef = useRef<BottomSheetModal>(null);
  // La sessione si apre una volta sola: in StrictMode l'effetto gira due volte
  // e senza guardia resterebbe un allenamento vuoto nel diario.
  const startedRef = useRef(false);

  const loadInfo = useCallback(async (exerciseId: string) => {
    const [sets, best] = await Promise.all([
      lastSetsFor(exerciseId),
      personalBest(exerciseId),
    ]);
    setInfos((prev) => ({ ...prev, [exerciseId]: { lastSets: sets, best } }));
  }, []);

  /**
   * Rimette le spunte sulle serie gia' scritte quando la sessione viene
   * RIPRESA. `startSession` ritrovava la sessione aperta, ma lo schermo
   * ripartiva vuoto: le serie gia' fatte sembravano da fare, e rispuntarle ne
   * scriveva di doppie.
   *
   * Ripristina anche i valori, non solo le spunte: una riga spuntata ha i campi
   * bloccati, e mostrarci dentro il carico dell'ultima volta invece di quello
   * appena registrato sarebbe una riga che mente.
   */
  const restoreLogged = useCallback(
    async (id: string, resolved: ResolvedDay) => {
      const already = await loggedSetsOf(id);
      if (already.length === 0) return;

      // Nessuna sostituzione puo' essere ancora avvenuta: si e' appena entrati.
      const refs = resolved.blocks.flatMap((block) =>
        planBlock(block, (_blockExerciseId, fallback) => fallback).map(
          (entry) => ({
            key: entry.key,
            blockId: entry.blockId,
            exerciseId: entry.exercise.id,
            setIndex: entry.setIndex,
          }),
        ),
      );
      const matched = matchLoggedSets(refs, already);
      const byId = new Map(already.map((set) => [set.id, set]));

      setLogged(matched);
      setValues((prev) => {
        const next = { ...prev };
        for (const [key, setId] of Object.entries(matched)) {
          const set = byId.get(setId);
          if (!set) continue;
          next[key] = {
            weight: set.weight === null ? "" : formatNumber(set.weight),
            reps: set.reps === null ? "" : String(set.reps),
          };
        }
        return next;
      });
    },
    [],
  );

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const resolved = await getRoutineDay(routineId, dayIndex);
        if (!active) return;
        setDay(resolved);
        if (!resolved) return;

        if (!startedRef.current) {
          startedRef.current = true;
          const id = await startSession({
            date: todayIso(),
            routineDayId: resolved.day.id,
          });
          if (!active) return;
          setSessionId(id);
          setStartedAt(await sessionStartedAt(id));
          await restoreLogged(id, resolved);
        }

        const ids = new Set<string>();
        for (const block of resolved.blocks) {
          for (const item of block.exercises) ids.add(item.exercise.id);
        }
        await Promise.all([...ids].map(loadInfo));
      } catch (error) {
        logger.error("[SessionScreen] errore avvio sessione", error);
        showToast.error({ message: t("general_error") });
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
    // t è ricreata a ogni cambio lingua: non deve far ripartire la sessione.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routineId, dayIndex, loadInfo]);

  const resolveExercise = useCallback(
    (blockExerciseId: string, fallback: ExerciseRow): ExerciseRow =>
      substitutions[blockExerciseId] ?? fallback,
    [substitutions],
  );

  /** I campi partono dall'ultima volta; senza storico restano vuoti. */
  const defaultValues = (
    exerciseId: string,
    setIndex: number,
    targetWeight: number | null,
    targetReps: string | null,
  ): SetValues => {
    const lastSets = infos[exerciseId]?.lastSets ?? [];
    const last = lastSets[setIndex] ?? lastSets[lastSets.length - 1];
    const weight = last?.weight ?? targetWeight;
    const reps = last?.reps ?? parseFirstInt(targetReps);
    return {
      weight:
        weight !== null && weight !== undefined ? formatNumber(weight) : "",
      reps: reps !== null && reps !== undefined ? String(reps) : "",
    };
  };

  const suggestedWeight = (
    exerciseId: string,
    targetReps: string | null,
    targetSets: number | null,
  ): number | null => {
    const target = parseFirstInt(targetReps);
    if (target === null) return null;
    const lastSets = (infos[exerciseId]?.lastSets ?? [])
      .filter((row) => row.weight !== null && row.reps !== null)
      .map((row) => ({ weight: row.weight ?? 0, reps: row.reps ?? 0 }));
    if (lastSets.length === 0) return null;
    return suggestNextWeight({
      lastSets,
      targetReps: target,
      // Senza le serie previste il carico salirebbe anche dopo una seduta
      // mollata a metà, che è il caso che la regola esiste per evitare.
      targetSets: targetSets ?? undefined,
      increment: WEIGHT_INCREMENT_KG,
    });
  };

  const setValue = (
    key: string,
    patch: Partial<SetValues>,
    base: SetValues,
  ) => {
    setValues((prev) => ({ ...prev, [key]: { ...base, ...patch } }));
  };

  const completeSet = async (
    planned: PlannedSet,
    current: SetValues,
    restSeconds: number,
  ) => {
    if (!sessionId) return;
    // In palestra si spunta di fretta e spesso due volte. `done` si aggiorna
    // solo dopo la scrittura, quindi senza questa guardia due tocchi ravvicinati
    // registrano due serie e contano doppio l'utilizzo dell'esercizio.
    if (inFlight.current.has(planned.key)) return;
    inFlight.current.add(planned.key);
    try {
      const id = await logSet({
        sessionId,
        exerciseId: planned.exercise.id,
        setIndex: planned.setIndex,
        reps: parseNumber(current.reps),
        weight: parseNumber(current.weight),
        blockRef: planned.blockId,
      });
      setLogged((prev) => ({ ...prev, [planned.key]: id }));
      if (planned.closesRound) {
        // Chiave nuova a ogni serie: il timer riparte da capo invece di
        // riprendere il conteggio della serie precedente.
        setRest({ key: `${planned.key}:${Date.now()}`, seconds: restSeconds });
      }
    } catch (error) {
      logger.error("[SessionScreen] errore salvataggio serie", error);
      showToast.error({ message: t("general_error") });
    } finally {
      inFlight.current.delete(planned.key);
    }
  };

  /**
   * Disfa una serie appena spuntata, per correggere un numero.
   *
   * La serie scritta si cancella davvero (logicamente): finche' resta, conta
   * nel volume e nei carichi, e una riga tornata modificabile sopra una serie
   * ancora registrata sarebbe la bugia che questa schermata evitava bloccando
   * il campo. Rispuntando se ne scrive una nuova.
   *
   * Il recupero non si tocca: chi despunta sta correggendo un numero, non
   * annullando il riposo che ha gia' fatto.
   */
  const undoSet = async (key: string) => {
    const setId = logged[key];
    if (setId === undefined) return;
    try {
      await deleteSet(setId);
      setLogged((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    } catch (error) {
      logger.error("[SessionScreen] errore annullamento serie", error);
      showToast.error({ message: t("general_error") });
    }
  };

  const finish = async () => {
    setConfirmFinish(false);
    try {
      if (sessionId) await endSession(sessionId);
    } catch (error) {
      logger.error("[SessionScreen] errore chiusura sessione", error);
    }
    goBack();
  };

  const openAlternatives = (blockExerciseId: string, exercise: ExerciseRow) => {
    setReplacing({ blockExerciseId, exercise });
    sheetRef.current?.present();
  };

  const pickAlternative = async (alternative: ExerciseRow) => {
    if (!replacing) return;
    setSubstitutions((prev) => ({
      ...prev,
      [replacing.blockExerciseId]: alternative,
    }));
    sheetRef.current?.dismiss();
    await loadInfo(alternative.id);
  };

  return (
    <View style={styles.root}>
      <ScreenBackground />
      <SafeAreaView edges={["top", "left", "right"]} style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity onPress={goBack} activeOpacity={0.6} hitSlop={10}>
            <ChevronLeft size={26} color={colors.textSecondary} />
          </TouchableOpacity>
          <Text
            style={[styles.title, { color: colors.text }]}
            numberOfLines={1}
          >
            {day?.name ?? t("gym.session")}
          </Text>
          {/* `compact`: senza, un bottone da 56 px alto piu' del doppio del
              chevron e del titolo faceva l'intestazione piu' alta di quella di
              ogni altra pagina, e si appoggiava alla barra di stato. */}
          <DfButton
            label={t("gym.finish")}
            onPress={() => setConfirmFinish(true)}
            variant="outlined"
            fullWidth={false}
            compact
          />
        </View>

        {loading ? (
          <ActivityIndicator style={styles.loader} color={colors.accent} />
        ) : !day ? (
          <EmptyState
            message={t("gym.day_not_found")}
            icon={<Dumbbell size={40} color={colors.textFaint} />}
          />
        ) : day.blocks.length === 0 ? (
          /* Un giorno senza blocchi apriva una schermata completamente vuota -
             nemmeno una frase - e da li' non si capiva ne' cosa mancasse ne'
             dove andarlo a mettere. Il giorno si riempie dal modulo della
             scheda, che e' dove porta il collegamento. */
          <View style={styles.emptyDay}>
            <EmptyState
              message={t("gym.no_blocks")}
              icon={<Dumbbell size={40} color={colors.textFaint} />}
            />
            <DfButton
              label={t("gym.edit_routine")}
              variant="outlined"
              onPress={() => navigate("RoutineForm", { id: routineId })}
            />
          </View>
        ) : (
          /* `FormScreen` e non una `ScrollView` nuda: qui si scrivono peso e
             ripetizioni, e senza il riparo dalla tastiera le serie in fondo
             all'allenamento finivano coperte mentre le si digitava. */
          <FormScreen
            contentContainerStyle={[
              styles.list,
              {
                paddingBottom:
                  insets.bottom + (rest ? TIMER_CLEARANCE : theme.spacing.lg),
              },
            ]}
            keyboardShouldPersistTaps="handled"
          >
            {/*
              L'hero della schermata: e' la risposta alla domanda che ci si fa
              qui dentro. Prima non c'era niente in cima, e "a che punto sono"
              si ricavava contando le spunte a occhio.
            */}
            <HeroPanel contentStyle={styles.progress}>
              {/*
                Due fatti indipendenti, ognuno con la sua etichetta: con una
                sola etichetta a destra "serie fatte" finiva sotto il
                cronometro e sembrava dire quello.
              */}
              <View style={styles.progressHead}>
                <View>
                  <Text style={[styles.progressValue, { color: colors.text }]}>
                    {doneSets}
                    <Text
                      style={[styles.progressTotal, { color: colors.textMuted }]}
                    >
                      {` / ${totalSets}`}
                    </Text>
                  </Text>
                  <Text
                    style={[styles.progressLabel, { color: colors.textMuted }]}
                    numberOfLines={1}
                  >
                    {t("gym.sets_done")}
                  </Text>
                </View>

                {elapsed ? (
                  <View style={styles.progressRight}>
                    <Text
                      style={[styles.elapsed, { color: colors.text }]}
                      numberOfLines={1}
                    >
                      {elapsed}
                    </Text>
                    <Text
                      style={[styles.progressLabel, { color: colors.textMuted }]}
                      numberOfLines={1}
                    >
                      {t("gym.duration")}
                    </Text>
                  </View>
                ) : null}
              </View>
              <View
                style={[styles.track, { backgroundColor: colors.surfaceMuted }]}
              >
                <View
                  style={[
                    styles.fill,
                    {
                      backgroundColor: colors.accent,
                      width: `${totalSets === 0 ? 0 : (doneSets / totalSets) * 100}%`,
                    },
                  ]}
                />
              </View>
            </HeroPanel>

            {day.blocks.map((block) => {
              const planned = planBlock(block, resolveExercise);
              const restSeconds =
                block.block.rest_seconds ?? DEFAULT_REST_SECONDS;
              const interleaved =
                block.kind === "superset" || block.kind === "circuit";

              return (
                <Card key={block.block.id} style={styles.block}>
                  {block.kind !== "single" ? (
                    <View
                      style={[
                        styles.blockTag,
                        { backgroundColor: colors.surfaceMuted },
                      ]}
                    >
                      <Text
                        style={[
                          styles.blockTagText,
                          { color: colors.textSecondary },
                        ]}
                      >
                        {t(`gym.block_${block.kind}`)}
                      </Text>
                    </View>
                  ) : null}

                  {block.exercises.map((item) => {
                    const exercise = resolveExercise(
                      item.row.id,
                      item.exercise,
                    );
                    const info = infos[exercise.id];
                    const suggested = suggestedWeight(
                      exercise.id,
                      item.row.target_reps,
                      item.row.target_sets,
                    );
                    // La serie più pesante dell'ultima volta, non la prima:
                    // è quella che dice davvero a che punto si era.
                    const lastTop = heaviestSet(info?.lastSets ?? []);

                    return (
                      <View key={item.row.id} style={styles.exercise}>
                        <Text
                          style={[styles.exerciseName, { color: colors.text }]}
                          numberOfLines={2}
                        >
                          {exercise.name}
                        </Text>
                        <Text
                          style={[styles.meta, { color: colors.textMuted }]}
                          numberOfLines={1}
                        >
                          {`${item.row.target_sets ?? DEFAULT_SETS} ${t("gym.sets")}`}
                          {item.row.target_reps
                            ? ` × ${item.row.target_reps} ${t("gym.reps")}`
                            : ""}
                        </Text>

                        <Text
                          style={[styles.meta, { color: colors.textMuted }]}
                          numberOfLines={1}
                        >
                          {lastTop && lastTop.weight !== null
                            ? t("gym.last_time", {
                                value: `${formatNumber(lastTop.weight)} ${t("gym.kg")} × ${lastTop.reps ?? "-"}`,
                              })
                            : t("gym.no_history")}
                        </Text>

                        {info?.best ? (
                          <Text
                            style={[styles.meta, { color: colors.textMuted }]}
                            numberOfLines={1}
                          >
                            {t("gym.personal_best", {
                              weight: formatNumber(info.best.weight),
                              reps: info.best.reps,
                            })}
                          </Text>
                        ) : null}

                        {suggested !== null ? (
                          <Text
                            style={[styles.suggested, { color: colors.text }]}
                            numberOfLines={1}
                          >
                            {t("gym.suggested_weight", {
                              weight: formatNumber(suggested),
                            })}
                          </Text>
                        ) : null}

                        <TouchableOpacity
                          onPress={() =>
                            openAlternatives(item.row.id, exercise)
                          }
                          activeOpacity={0.6}
                          accessibilityRole="button"
                          style={styles.altButton}
                        >
                          <Repeat2 size={14} color={colors.textMuted} />
                          <Text
                            style={[
                              styles.altLabel,
                              { color: colors.textMuted },
                            ]}
                            numberOfLines={1}
                          >
                            {t("gym.alternatives")}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    );
                  })}

                  <View
                    style={[styles.divider, { backgroundColor: colors.border }]}
                  />

                  <SetHeader />

                  {planned.map((entry, index) => {
                    const source = block.exercises.find(
                      (item) => item.row.id === entry.blockExerciseId,
                    );
                    const base = defaultValues(
                      entry.exercise.id,
                      entry.setIndex,
                      source?.row.target_weight ?? null,
                      source?.row.target_reps ?? null,
                    );
                    const current = values[entry.key] ?? base;
                    const newRound =
                      interleaved &&
                      (index === 0 || planned[index - 1].round !== entry.round);

                    return (
                      <React.Fragment key={entry.key}>
                        {newRound ? (
                          <SectionLabel style={styles.round}>
                            {t("gym.round", { n: entry.round + 1 })}
                          </SectionLabel>
                        ) : null}
                        <SetRow
                          setNumber={entry.setIndex + 1}
                          exerciseName={
                            block.exercises.length > 1
                              ? entry.exercise.name
                              : undefined
                          }
                          targetReps={source?.row.target_reps ?? null}
                          weight={current.weight}
                          reps={current.reps}
                          done={logged[entry.key] !== undefined}
                          onChangeWeight={(value) =>
                            setValue(entry.key, { weight: value }, current)
                          }
                          onChangeReps={(value) =>
                            setValue(entry.key, { reps: value }, current)
                          }
                          onDone={() =>
                            completeSet(entry, current, restSeconds)
                          }
                          onUndo={() => undoSet(entry.key)}
                        />
                      </React.Fragment>
                    );
                  })}
                </Card>
              );
            })}
          </FormScreen>
        )}
      </SafeAreaView>

      {/* Fuori dalla lista: scorrere la pagina non deve fermare il recupero. */}
      {rest ? (
        <View
          style={[styles.timer, { bottom: insets.bottom + theme.spacing.sm }]}
          pointerEvents="box-none"
        >
          <RestTimer
            key={rest.key}
            seconds={rest.seconds}
            onFinish={() => setRest(null)}
            onSkip={() => setRest(null)}
          />
        </View>
      ) : null}

      <AlternativesSheet
        ref={sheetRef}
        exercise={replacing?.exercise ?? null}
        onPick={pickAlternative}
        rank={rankWithAi}
      />

      <DfAlert
        isOpen={confirmFinish}
        title={t("gym.finish_title")}
        message={t("gym.finish_message")}
        confirmLabel={t("gym.finish")}
        cancelLabel={t("cancel")}
        onConfirm={finish}
        onClose={() => setConfirmFinish(false)}
      />
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
    paddingVertical: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  title: { flex: 1, flexShrink: 1, fontSize: 18, fontWeight: "700" },
  loader: { marginTop: theme.spacing.xl },
  emptyDay: { paddingHorizontal: theme.spacing.md, gap: theme.spacing.md },
  progress: { gap: theme.spacing.sm },
  progressHead: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: theme.spacing.sm,
  },
  progressValue: { fontSize: 26, fontWeight: "700" },
  progressRight: { flexShrink: 1, alignItems: "flex-end" },
  elapsed: { fontSize: 26, fontWeight: "700", fontVariant: ["tabular-nums"] },
  progressTotal: { fontSize: 17, fontWeight: "600" },
  progressLabel: {
    flexShrink: 1,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  track: { height: 6, borderRadius: theme.radius.full, overflow: "hidden" },
  fill: { height: "100%", borderRadius: theme.radius.full },
  list: { paddingHorizontal: theme.spacing.md, gap: theme.spacing.md },
  block: { gap: theme.spacing.xs },
  blockTag: {
    alignSelf: "flex-start",
    borderRadius: theme.radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: theme.spacing.xs,
  },
  blockTagText: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  exercise: { gap: 2, marginBottom: theme.spacing.xs },
  exerciseName: { flexShrink: 1, fontSize: 17, fontWeight: "700" },
  meta: { flexShrink: 1, fontSize: 12 },
  suggested: { flexShrink: 1, fontSize: 13, fontWeight: "600", marginTop: 2 },
  // Un'azione rara vestita da azione principale: era una pillola a contorno
  // grande quanto il nome dell'esercizio, per una cosa che si fa quando il
  // bilanciere e' occupato. Ora e' un collegamento, e la riga la si trova
  // quando la si cerca.
  altButton: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 32,
    marginTop: 2,
  },
  altLabel: { flexShrink: 1, fontSize: 12, fontWeight: "500" },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: theme.spacing.xs,
  },
  round: { marginTop: theme.spacing.xs, marginBottom: 0 },
  timer: {
    position: "absolute",
    left: theme.spacing.md,
    right: theme.spacing.md,
  },
});
