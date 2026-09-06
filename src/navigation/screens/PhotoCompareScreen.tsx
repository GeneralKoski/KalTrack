import { EmptyState, ScreenBackground } from "@/src/components/kal";
import { SyncedPhoto } from "@/src/components/kal/SyncedPhoto";
import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import {
  listProgressPhotos,
  type ProgressPhotoRow,
} from "@/src/db/queries/wellbeing";
import { useAppNav } from "@/src/hooks/useAppNav";
import { useFocusData } from "@/src/hooks/useFocusData";
import { useTranslation } from "@/src/hooks/useTranslation";
import { theme } from "@/src/styles";
import { useCompareViewStore } from "@/src/stores/compareViewStore";
import { PHOTO_POSES } from "@/src/types/wellbeing";
import { formatDate } from "@/src/utils/dateUtils";
import type { StaticScreenProps } from "@react-navigation/native";
import { Columns2, ImageOff, MoveHorizontal, X } from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

/** Le foto si ritagliano 3:4 (vedi `PHOTO_ASPECT`): il riquadro le segue. */
const ASPECT = 3 / 4;

/** Quanto e' larga la maniglia che si trascina, e la sua riga. */
const HANDLE = 36;
const SEAM = 2;

/**
 * La chiave che accoppia due foto: la posa, oppure il fatto di non averne una.
 *
 * Le foto senza posa fanno gruppo a se' invece di restare fuori: chi non
 * etichetta gli scatti si ritroverebbe un confronto vuoto, che e' il modo
 * peggiore di dirgli che avrebbe dovuto etichettarli.
 */
const NO_POSE = "__nessuna__";

const poseKey = (photo: ProgressPhotoRow): string => photo.pose ?? NO_POSE;

type Props = StaticScreenProps<{ first: string; last: string }>;

/**
 * Due giornate a confronto, una sopra l'altra, con un cursore che scopre
 * l'una o l'altra.
 *
 * Si confronta **posa con posa** - fronte con fronte - e non la prima foto di
 * un giorno con la prima dell'altro: un fronte accanto a un retro non dice
 * niente di come sei cambiato, ed e' quel che faceva la card automatica in
 * cima all'elenco, che questa schermata sostituisce.
 */
export function PhotoCompareScreen({ route }: Props) {
  const { first, last } = route.params;
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const { goBack } = useAppNav();
  const insets = useSafeAreaInsets();
  const { width: screenW, height: screenH } = useWindowDimensions();
  const view = useCompareViewStore((state) => state.view);
  const setView = useCompareViewStore((state) => state.setView);

  const loader = useCallback(() => listProgressPhotos(), []);
  const { data, loading } = useFocusData<ProgressPhotoRow[]>(loader);

  /**
   * Le pose confrontabili: quelle che ci sono in ENTRAMBE le giornate.
   *
   * Le altre restano in elenco ma spente - toglierle nasconderebbe che quella
   * posa esiste, e chi la cerca penserebbe di non averla mai scattata.
   */
  const { pairs, order } = useMemo(() => {
    const photos = data ?? [];
    const of = (date: string) => {
      const byPose = new Map<string, ProgressPhotoRow>();
      for (const photo of photos) {
        // La prima incontrata vince: `listProgressPhotos` ordina per data e poi
        // per created_at decrescente, quindi e' la piu' recente di quel giorno.
        if (photo.date === date && !byPose.has(poseKey(photo))) {
          byPose.set(poseKey(photo), photo);
        }
      }
      return byPose;
    };

    const before = of(first);
    const after = of(last);
    /* Le pose note in ordine dichiarato, poi le sconosciute e le senza posa:
       un elenco che cambia ordine da un giorno all'altro non si impara. */
    const known: string[] = [...PHOTO_POSES];
    const extra = [...new Set([...before.keys(), ...after.keys()])]
      .filter((key) => !known.includes(key))
      .sort();

    const result = new Map<
      string,
      { before?: ProgressPhotoRow; after?: ProgressPhotoRow }
    >();
    for (const key of [...known, ...extra]) {
      const b = before.get(key);
      const a = after.get(key);
      if (b || a) result.set(key, { before: b, after: a });
    }
    return { pairs: result, order: [...result.keys()] };
  }, [data, first, last]);

  const complete = order.filter((key) => {
    const pair = pairs.get(key);
    return pair?.before && pair.after;
  });

  const [pose, setPose] = useState<string | null>(null);
  const active = pose && complete.includes(pose) ? pose : (complete[0] ?? null);
  const pair = active ? pairs.get(active) : undefined;

  const days = Math.round(
    (Date.parse(`${last}T00:00:00Z`) - Date.parse(`${first}T00:00:00Z`)) /
      86_400_000,
  );

  /*
    Il riquadro piu' grande che ci sta: prima prova a riempire la larghezza, e
    se cosi' sfora in altezza parte dall'altezza. I 200 sono l'intestazione, le
    linguette e la riga dei giorni di distanza; il minimo evita che su uno
    schermo corto - o con la tastiera aperta - venga fuori una larghezza
    negativa, che manderebbe il cursore fuori scala.
  */
  const available = screenH - insets.top - insets.bottom - 200;
  /* Affiancate ce ne stanno due sulla riga, quindi ciascuna vale la meta'
     della larghezza utile. */
  const usableW =
    view === "side" ? (screenW - theme.spacing.md * 3) / 2 : screenW;
  const boxW = Math.max(120, Math.min(usableW, available * ASPECT));
  const boxH = boxW / ASPECT;

  /*
    La posizione del cursore, in pixel dal bordo sinistro del riquadro.

    Si ricentra quando il riquadro cambia larghezza - si passa da affiancate a
    cursore, o si ruota il telefono: il valore vecchio e' misurato su un
    riquadro che non c'e' piu', e finirebbe oltre il bordo.
  */
  const cut = useSharedValue(boxW / 2);
  useEffect(() => {
    cut.value = boxW / 2;
  }, [boxW, cut]);
  const pan = Gesture.Pan().onChange((event) => {
    const next = cut.value + event.changeX;
    cut.value = next < 0 ? 0 : next > boxW ? boxW : next;
  });

  const revealStyle = useAnimatedStyle(() => ({ width: cut.value }));
  const handleStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: cut.value - HANDLE / 2 }],
  }));

  const poseLabel = (value: string) =>
    value === NO_POSE
      ? t("progress_photos.pose_none")
      : t(`progress_photos.poses.${value}`, { defaultValue: value });

  return (
    <View style={styles.root}>
      <ScreenBackground />
      <SafeAreaView edges={["top", "left", "right"]} style={styles.safe}>
        <View style={styles.header}>
          <Text
            style={[styles.title, { color: colors.text }]}
            numberOfLines={1}
          >
            {`${formatDate(first)}  ↔  ${formatDate(last)}`}
          </Text>
          <TouchableOpacity onPress={goBack} activeOpacity={0.6} hitSlop={10}>
            <X size={24} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {order.length > 1 ? (
          <View style={styles.tabs}>
            {order.map((key) => {
              const usable = complete.includes(key);
              const selected = key === active;
              return (
                <TouchableOpacity
                  key={key}
                  onPress={() => usable && setPose(key)}
                  activeOpacity={0.6}
                  disabled={!usable}
                  style={[
                    styles.tab,
                    {
                      borderBottomColor: selected
                        ? colors.accent
                        : "transparent",
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.tabLabel,
                      {
                        color: !usable
                          ? colors.textFaint
                          : selected
                            ? colors.accent
                            : colors.textMuted,
                      },
                    ]}
                  >
                    {poseLabel(key)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : null}

        {loading && !data ? (
          <ActivityIndicator style={styles.loader} color={colors.accent} />
        ) : !pair?.before || !pair.after ? (
          <EmptyState
            message={t("progress_photos.compare_no_pair")}
            icon={<ImageOff size={40} color={colors.textFaint} />}
          />
        ) : (
          <View style={styles.stage}>
            {view === "side" ? (
              <View style={styles.pairRow}>
                {[
                  { photo: pair.before, date: first },
                  { photo: pair.after, date: last },
                ].map(({ photo, date }) => (
                  <View key={date}>
                    <View
                      style={[
                        styles.box,
                        {
                          width: boxW,
                          height: boxH,
                          backgroundColor: colors.surfaceMuted,
                        },
                      ]}
                    >
                      <SyncedPhoto
                        uri={photo.uri}
                        style={styles.photo}
                        contentFit="cover"
                      />
                    </View>
                    <Text
                      style={[styles.sideDate, { color: colors.textMuted }]}
                      numberOfLines={1}
                    >
                      {formatDate(date)}
                    </Text>
                  </View>
                ))}
              </View>
            ) : (
              <GestureDetector gesture={pan}>
                <View
                  style={[
                    styles.box,
                    {
                      width: boxW,
                      height: boxH,
                      backgroundColor: colors.surfaceMuted,
                    },
                  ]}
                >
                  {/* Sotto la piu' recente, per intero. */}
                  <SyncedPhoto
                    uri={pair.after.uri}
                    style={styles.photo}
                    contentFit="cover"
                  />

                  {/*
                  Sopra la piu' vecchia, tagliata a sinistra dal cursore. La
                  foto dentro tiene la larghezza PIENA del riquadro: e' la
                  cornice a stringersi, altrimenti l'immagine si schiaccerebbe
                  invece di scoprirsi.
                */}
                  <Animated.View style={[styles.reveal, revealStyle]}>
                    <SyncedPhoto
                      uri={pair.before.uri}
                      style={[styles.photo, { width: boxW }]}
                      contentFit="cover"
                    />
                  </Animated.View>

                  <Animated.View
                    style={[styles.handle, { width: HANDLE }, handleStyle]}
                    pointerEvents="none"
                  >
                    <View
                      style={[
                        styles.seam,
                        { backgroundColor: theme.colors.white },
                      ]}
                    />
                    <View
                      style={[styles.grip, { backgroundColor: colors.accent }]}
                    />
                  </Animated.View>

                  <Text style={[styles.stamp, styles.stampLeft]}>
                    {formatDate(first)}
                  </Text>
                  <Text style={[styles.stamp, styles.stampRight]}>
                    {formatDate(last)}
                  </Text>
                </View>
              </GestureDetector>
            )}

            <Text style={[styles.gap, { color: colors.textSecondary }]}>
              {t(
                days === 1
                  ? "progress_photos.compare_day"
                  : "progress_photos.compare_days",
                { count: days },
              )}
            </Text>
          </View>
        )}

        {/*
          Cursore o affiancate: non c'e' una migliore, e la scelta resta
          (`compareViewStore`, in AsyncStorage come il tema).

          Sta qui in fondo, dove lo spazio c'e', e non stretto in un angolo
          dell'intestazione: cosi' porta anche l'etichetta, e due icone da sole
          non dicono cosa fanno finche' non le si prova.
        */}
        {pair?.before && pair.after ? (
          <View
            style={[
              styles.modes,
              {
                borderColor: colors.border,
                marginBottom: insets.bottom + theme.spacing.md,
              },
            ]}
          >
            {(
              [
                ["slider", MoveHorizontal],
                ["side", Columns2],
              ] as const
            ).map(([value, Icon]) => {
              const on = view === value;
              return (
                <TouchableOpacity
                  key={value}
                  onPress={() => setView(value)}
                  activeOpacity={0.6}
                  style={[
                    styles.mode,
                    on && { backgroundColor: colors.accent },
                  ]}
                >
                  <Icon
                    size={16}
                    color={on ? colors.accentOn : colors.textMuted}
                  />
                  <Text
                    style={[
                      styles.modeLabel,
                      { color: on ? colors.accentOn : colors.textMuted },
                    ]}
                  >
                    {t(`progress_photos.view_${value}`)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : null}
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
    paddingVertical: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  title: { flex: 1, fontSize: 16, fontWeight: "700" },
  modes: {
    flexDirection: "row",
    alignSelf: "center",
    borderWidth: 1,
    borderRadius: theme.radius.full,
    overflow: "hidden",
  },
  mode: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  modeLabel: { fontSize: 13, fontWeight: "600" },
  pairRow: { flexDirection: "row", gap: theme.spacing.md },
  sideDate: {
    fontSize: 12,
    textAlign: "center",
    marginTop: theme.spacing.xs,
  },
  tabs: {
    flexDirection: "row",
    paddingHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 2,
  },
  tabLabel: { fontSize: 14, fontWeight: "600" },
  stage: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing.md,
  },
  box: { borderRadius: theme.radius.lg, overflow: "hidden" },
  photo: { width: "100%", height: "100%" },
  reveal: {
    position: "absolute",
    top: 0,
    left: 0,
    bottom: 0,
    overflow: "hidden",
  },
  handle: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  seam: { position: "absolute", top: 0, bottom: 0, width: SEAM },
  grip: {
    width: HANDLE,
    height: HANDLE,
    borderRadius: theme.radius.full,
    borderWidth: 2,
    borderColor: theme.colors.white,
  },
  stamp: {
    position: "absolute",
    bottom: theme.spacing.sm,
    fontSize: 12,
    fontWeight: "600",
    color: theme.colors.white,
    backgroundColor: "rgba(0,0,0,0.55)",
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 2,
    borderRadius: theme.radius.full,
    overflow: "hidden",
  },
  stampLeft: { left: theme.spacing.sm },
  stampRight: { right: theme.spacing.sm },
  gap: { fontSize: 13 },
  loader: { marginTop: theme.spacing.xl },
});
