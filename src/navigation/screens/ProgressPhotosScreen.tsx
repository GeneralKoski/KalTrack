import { DfAlert } from "@/src/components/DfAlert";
import { DfButton } from "@/src/components/form/DfButton";
import {
  Card,
  Chip,
  EmptyState,
  PhotoField,
  ScreenBackground,
  SectionLabel,
} from "@/src/components/kal";
import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import {
  addProgressPhoto,
  deleteProgressPhoto,
  listProgressPhotos,
  type ProgressPhotoRow,
} from "@/src/db/queries/wellbeing";
import { todayIso } from "@/src/domain/date";
import { useAppNav } from "@/src/hooks/useAppNav";
import { useFocusData } from "@/src/hooks/useFocusData";
import { useTranslation } from "@/src/hooks/useTranslation";
import { theme } from "@/src/styles";
import { formatDate } from "@/src/utils/dateUtils";
import { logger } from "@/src/utils/logger";
import { Image } from "expo-image";
import { Camera, ChevronLeft } from "lucide-react-native";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

const COLUMNS = 3;

// Pose in italiano minuscolo: sono la chiave scritta a DB, come i siti delle misure.
const POSES = ["fronte", "lato", "retro"];

/** Spezza in righe di lunghezza fissa: una griglia senza flexWrap e senza celle vuote. */
function chunk<T>(items: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size) rows.push(items.slice(i, i + size));
  return rows;
}

/** Giorni fra due date ISO. Entrambe sono lette in UTC, quindi la differenza è esatta. */
function daysBetween(fromIso: string, toIso: string): number {
  const ms = Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

export function ProgressPhotosScreen() {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const { goBack } = useAppNav();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const [pendingUri, setPendingUri] = useState<string | null>(null);
  const [pose, setPose] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<ProgressPhotoRow | null>(null);

  const loader = useCallback(() => listProgressPhotos(), []);
  const { data, loading, reload } = useFocusData<ProgressPhotoRow[]>(loader);
  const photos = useMemo(() => data ?? [], [data]);

  // Le foto arrivano già ordinate per data decrescente: la Map conserva
  // l'ordine di inserimento, quindi i gruppi escono dal più recente.
  const groups = useMemo(() => {
    const byDate = new Map<string, ProgressPhotoRow[]>();
    for (const photo of photos) {
      const bucket = byDate.get(photo.date);
      if (bucket) bucket.push(photo);
      else byDate.set(photo.date, [photo]);
    }
    return [...byDate.entries()];
  }, [photos]);

  const newest = photos.length > 0 ? photos[0] : null;
  const oldest = photos.length > 0 ? photos[photos.length - 1] : null;
  // Il confronto ha senso solo fra due giorni diversi: fronte e retro dello
  // stesso giorno affiancati non mostrerebbero nessun progresso.
  const comparable =
    newest && oldest && newest.date !== oldest.date
      ? { first: oldest, last: newest }
      : null;

  const compareDays = comparable
    ? daysBetween(comparable.first.date, comparable.last.date)
    : 0;

  const tileSize = Math.floor(
    (width - theme.spacing.md * 2 - theme.spacing.sm * (COLUMNS - 1)) / COLUMNS,
  );

  const poseLabel = (value: string) =>
    t(`progress_photos.poses.${value}`, { defaultValue: value });

  const save = async () => {
    if (!pendingUri || saving) return;
    setSaving(true);
    try {
      await addProgressPhoto(todayIso(), pendingUri, pose);
      setPendingUri(null);
      setPose(null);
      reload();
    } catch (error) {
      logger.error("[ProgressPhotosScreen] salvataggio foto fallito", error);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!selected) return;
    try {
      await deleteProgressPhoto(selected.id);
      reload();
    } catch (error) {
      logger.error("[ProgressPhotosScreen] eliminazione foto fallita", error);
    } finally {
      setSelected(null);
    }
  };

  return (
    <View style={styles.root}>
      <ScreenBackground />
      <SafeAreaView edges={["top", "left", "right"]} style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity onPress={goBack} activeOpacity={0.6} hitSlop={10}>
            <ChevronLeft size={26} color={colors.textSecondary} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
            {t("progress_photos.title")}
          </Text>
        </View>

        {loading && !data ? (
          <ActivityIndicator style={styles.loader} color={colors.accent} />
        ) : (
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={[
              styles.content,
              { paddingBottom: insets.bottom + theme.spacing.lg },
            ]}
          >
            <SectionLabel>{t("progress_photos.add")}</SectionLabel>
            <Card style={styles.card}>
              <PhotoField uri={pendingUri} onChange={setPendingUri} />

              {pendingUri ? (
                <>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                    contentContainerStyle={styles.poses}
                  >
                    {POSES.map((value) => (
                      <Chip
                        key={value}
                        label={poseLabel(value)}
                        active={value === pose}
                        // Ritoccare la posa scelta la toglie: la posa è facoltativa.
                        onPress={() => setPose(pose === value ? null : value)}
                      />
                    ))}
                  </ScrollView>

                  <DfButton
                    label={t("progress_photos.save")}
                    onPress={save}
                    loading={saving}
                  />
                </>
              ) : null}
            </Card>

            {comparable ? (
              <>
                <SectionLabel style={styles.section}>
                  {t("progress_photos.compare")}
                </SectionLabel>
                <Card style={styles.card}>
                  <View style={styles.compareRow}>
                    {[comparable.first, comparable.last].map((photo, index) => (
                      <View key={photo.id} style={styles.compareItem}>
                        <Image
                          source={{ uri: photo.uri }}
                          style={[
                            styles.compareImage,
                            { backgroundColor: colors.surfaceMuted },
                          ]}
                          contentFit="cover"
                        />
                        <Text
                          style={[styles.compareLabel, { color: colors.textMuted }]}
                          numberOfLines={1}
                        >
                          {`${
                            index === 0
                              ? t("progress_photos.compare_first")
                              : t("progress_photos.compare_last")
                          } · ${formatDate(photo.date)}`}
                        </Text>
                      </View>
                    ))}
                  </View>
                  <Text style={[styles.compareGap, { color: colors.textSecondary }]}>
                    {t(
                      compareDays === 1
                        ? "progress_photos.compare_day"
                        : "progress_photos.compare_days",
                      { count: compareDays },
                    )}
                  </Text>
                </Card>
              </>
            ) : null}

            {photos.length === 0 ? (
              <EmptyState
                message={t("progress_photos.empty")}
                icon={<Camera size={40} color={colors.textFaint} />}
              />
            ) : (
              groups.map(([date, items]) => (
                <View key={date}>
                  <SectionLabel style={styles.section}>
                    {formatDate(date)}
                  </SectionLabel>
                  {chunk(items, COLUMNS).map((row) => (
                    <View key={row[0].id} style={styles.gridRow}>
                      {row.map((photo) => (
                        <TouchableOpacity
                          key={photo.id}
                          activeOpacity={0.6}
                          onPress={() => setSelected(photo)}
                          style={{ width: tileSize }}
                        >
                          <Image
                            source={{ uri: photo.uri }}
                            style={[
                              styles.tile,
                              {
                                height: tileSize,
                                backgroundColor: colors.surfaceMuted,
                              },
                            ]}
                            contentFit="cover"
                          />
                          {photo.pose ? (
                            <Text style={styles.tilePose} numberOfLines={1}>
                              {poseLabel(photo.pose)}
                            </Text>
                          ) : null}
                        </TouchableOpacity>
                      ))}
                    </View>
                  ))}
                </View>
              ))
            )}
          </ScrollView>
        )}
      </SafeAreaView>

      <DfAlert
        isOpen={selected !== null}
        title={selected ? formatDate(selected.date) : undefined}
        confirmLabel={t("delete")}
        confirmColor={theme.colors.error}
        cancelLabel={t("close")}
        onConfirm={remove}
        onClose={() => setSelected(null)}
      >
        {selected ? (
          <View style={styles.preview}>
            <Image
              source={{ uri: selected.uri }}
              style={[
                styles.previewImage,
                { backgroundColor: colors.surfaceMuted },
              ]}
              contentFit="contain"
            />
            {selected.pose ? (
              <Text style={[styles.previewPose, { color: colors.textMuted }]}>
                {poseLabel(selected.pose)}
              </Text>
            ) : null}
          </View>
        ) : null}
      </DfAlert>
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
  title: { flex: 1, fontSize: 18, fontWeight: "700" },
  content: { paddingHorizontal: theme.spacing.md },
  card: { gap: theme.spacing.sm },
  section: { marginTop: theme.spacing.md },
  poses: { gap: theme.spacing.sm },
  compareRow: {
    flexDirection: "row",
    gap: theme.spacing.sm,
  },
  compareItem: { flex: 1, gap: theme.spacing.xs },
  compareImage: {
    width: "100%",
    aspectRatio: 3 / 4,
    borderRadius: theme.radius.lg,
  },
  compareLabel: { flexShrink: 1, fontSize: 12, textAlign: "center" },
  compareGap: { fontSize: 13, textAlign: "center" },
  gridRow: {
    flexDirection: "row",
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  tile: {
    width: "100%",
    borderRadius: theme.radius.lg,
  },
  tilePose: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    fontSize: 11,
    textAlign: "center",
    color: theme.colors.white,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderBottomLeftRadius: theme.radius.lg,
    borderBottomRightRadius: theme.radius.lg,
    paddingVertical: 2,
  },
  preview: {
    gap: theme.spacing.sm,
  },
  previewImage: {
    width: "100%",
    aspectRatio: 3 / 4,
    borderRadius: theme.radius.lg,
  },
  previewPose: { fontSize: 13, textAlign: "center" },
  loader: { marginTop: theme.spacing.xl },
});
