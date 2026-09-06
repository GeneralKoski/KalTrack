import { DfAlert } from "@/src/components/DfAlert";
import {
  EmptyState,
  ScreenBackground,
  SectionLabel,
} from "@/src/components/kal";
import { SyncedPhoto } from "@/src/components/kal/SyncedPhoto";
import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import { ComparePickerSheet } from "@/src/containers/wellbeing/ComparePickerSheet";
import { ProgressPhotoFormSheet } from "@/src/containers/wellbeing/ProgressPhotoFormSheet";
import {
  deleteProgressPhoto,
  listProgressPhotos,
  type ProgressPhotoRow,
} from "@/src/db/queries/wellbeing";
import { useAppNav } from "@/src/hooks/useAppNav";
import { useFocusData } from "@/src/hooks/useFocusData";
import { useTranslation } from "@/src/hooks/useTranslation";
import { theme } from "@/src/styles";
import { formatDate } from "@/src/utils/dateUtils";
import { logger } from "@/src/utils/logger";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import {
  Camera,
  Check,
  ChevronLeft,
  GitCompareArrows,
  Plus,
  Trash2,
  X,
} from "lucide-react-native";
import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

const COLUMNS = 3;

/** Spezza in righe di lunghezza fissa: una griglia senza flexWrap e senza celle vuote. */
function chunk<T>(items: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size)
    rows.push(items.slice(i, i + size));
  return rows;
}

export function ProgressPhotosScreen() {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const { navigate, goBack } = useAppNav();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const formRef = useRef<BottomSheetModal>(null);
  const compareRef = useRef<BottomSheetModal>(null);

  const [selected, setSelected] = useState<ProgressPhotoRow | null>(null);
  /**
   * La foto aperta nel foglio in modifica.
   *
   * Distinta da `selected`, che e' quella in anteprima: le due finestre non
   * possono stare aperte insieme - un bottom sheet sotto un modale su Android
   * resta cieco ai gesti - quindi "Modifica" chiude l'anteprima e apre il
   * foglio, e serve un secondo stato per sapere cosa mostrarci dentro.
   */
  const [editing, setEditing] = useState<ProgressPhotoRow | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmDeleteSelection, setConfirmDeleteSelection] = useState(false);
  const [deletingSelection, setDeletingSelection] = useState(false);
  const isSelecting = selectedIds.size > 0;

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

  /* Il confronto ha senso da due giornate in su: con una sola non c'e' un
     prima e un dopo da scegliere. */
  const comparable = new Set(photos.map((photo) => photo.date)).size >= 2;

  const tileSize = Math.floor(
    (width - theme.spacing.md * 2 - theme.spacing.sm * (COLUMNS - 1)) / COLUMNS,
  );

  const poseLabel = (value: string) =>
    t(`progress_photos.poses.${value}`, { defaultValue: value });

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

  /* Chiude l'anteprima prima di aprire il foglio: due overlay insieme e i
     gesti del foglio non arrivano. */
  const openEdit = (photo: ProgressPhotoRow) => {
    setSelected(null);
    setEditing(photo);
    formRef.current?.present();
  };

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const exitSelection = () => setSelectedIds(new Set());

  const onTilePress = (photo: ProgressPhotoRow) => {
    if (isSelecting) toggleSelection(photo.id);
    else setSelected(photo);
  };

  const onTileLongPress = (photo: ProgressPhotoRow) => {
    if (!isSelecting) toggleSelection(photo.id);
  };

  const removeSelection = async () => {
    if (selectedIds.size === 0 || deletingSelection) return;
    setDeletingSelection(true);
    try {
      await Promise.all([...selectedIds].map((id) => deleteProgressPhoto(id)));
      exitSelection();
      reload();
    } catch (error) {
      logger.error(
        "[ProgressPhotosScreen] eliminazione multipla fallita",
        error,
      );
    } finally {
      setDeletingSelection(false);
      setConfirmDeleteSelection(false);
    }
  };

  return (
    <View style={styles.root}>
      <ScreenBackground />
      <SafeAreaView edges={["top", "left", "right"]} style={styles.safe}>
        <View style={styles.header}>
          {isSelecting ? (
            <>
              <TouchableOpacity
                onPress={exitSelection}
                activeOpacity={0.6}
                hitSlop={10}
              >
                <X size={24} color={colors.textSecondary} />
              </TouchableOpacity>
              <Text
                style={[styles.title, { color: colors.text }]}
                numberOfLines={1}
              >
                {t(
                  selectedIds.size === 1
                    ? "progress_photos.selected_one"
                    : "progress_photos.selected_many",
                  { count: selectedIds.size },
                )}
              </Text>
              <TouchableOpacity
                onPress={() => setConfirmDeleteSelection(true)}
                activeOpacity={0.6}
                hitSlop={10}
              >
                <Trash2 size={22} color={theme.colors.error} />
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TouchableOpacity
                onPress={goBack}
                activeOpacity={0.6}
                hitSlop={10}
              >
                <ChevronLeft size={26} color={colors.textSecondary} />
              </TouchableOpacity>
              <Text
                style={[styles.title, { color: colors.text }]}
                numberOfLines={1}
              >
                {t("progress_photos.title")}
              </Text>
              {/* Il confronto si sceglie: prima una card in cima affiancava
                  d'ufficio la foto piu' vecchia e la piu' recente, e le pose
                  non c'entravano niente. */}
              {comparable ? (
                <TouchableOpacity
                  onPress={() => compareRef.current?.present()}
                  activeOpacity={0.6}
                  hitSlop={10}
                  accessibilityLabel={t("progress_photos.compare")}
                >
                  <GitCompareArrows size={22} color={colors.text} />
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                onPress={() => formRef.current?.present()}
                activeOpacity={0.6}
                hitSlop={10}
              >
                <Plus size={24} color={colors.text} />
              </TouchableOpacity>
            </>
          )}
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
                          onPress={() => onTilePress(photo)}
                          onLongPress={() => onTileLongPress(photo)}
                          style={{ width: tileSize }}
                        >
                          <SyncedPhoto
                            uri={photo.uri}
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
                          {isSelecting ? (
                            <View
                              style={[
                                styles.tileOverlay,
                                selectedIds.has(photo.id) && {
                                  backgroundColor: "rgba(0,0,0,0.35)",
                                },
                              ]}
                            >
                              <View
                                style={[
                                  styles.tileCheck,
                                  selectedIds.has(photo.id)
                                    ? { backgroundColor: colors.accent }
                                    : {
                                        backgroundColor: "rgba(0,0,0,0.35)",
                                        borderWidth: 1,
                                        borderColor: theme.colors.white,
                                      },
                                ]}
                              >
                                {selectedIds.has(photo.id) ? (
                                  <Check size={14} color={theme.colors.white} />
                                ) : null}
                              </View>
                            </View>
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

      {/*
        Il piede porta le due azioni, in riga: si esce con la X in alto a
        destra o toccando fuori. Prima il posto di sinistra era di un "Chiudi"
        che non faceva niente, e "Modifica" stava nel corpo - due bottoni
        impilati con in mezzo lo stacco del piede.
      */}
      <DfAlert
        isOpen={selected !== null}
        title={selected ? formatDate(selected.date) : undefined}
        showCloseButton
        cancelLabel={t("progress_photos.edit_action")}
        onCancel={() => selected && openEdit(selected)}
        confirmLabel={t("delete")}
        confirmColor={theme.colors.error}
        onConfirm={remove}
        onClose={() => setSelected(null)}
      >
        {selected ? (
          <View style={styles.preview}>
            <SyncedPhoto
              uri={selected.uri}
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

      <ComparePickerSheet
        ref={compareRef}
        photos={photos}
        onCompare={(first, last) => navigate("PhotoCompare", { first, last })}
      />

      <ProgressPhotoFormSheet
        ref={formRef}
        editing={editing}
        onSaved={reload}
        onDismissed={() => setEditing(null)}
      />

      <DfAlert
        isOpen={confirmDeleteSelection}
        title={t("progress_photos.delete_selected_title", {
          count: selectedIds.size,
        })}
        confirmLabel={t("delete")}
        confirmColor={theme.colors.error}
        cancelLabel={t("cancel")}
        loading={deletingSelection}
        onConfirm={removeSelection}
        onClose={() => setConfirmDeleteSelection(false)}
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
  title: { flex: 1, fontSize: 18, fontWeight: "700" },
  content: { paddingHorizontal: theme.spacing.md },
  section: { marginTop: theme.spacing.md },
  gridRow: {
    flexDirection: "row",
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  tile: {
    width: "100%",
    borderRadius: theme.radius.lg,
  },
  tileOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.xs,
    alignItems: "flex-end",
  },
  tileCheck: {
    width: 22,
    height: 22,
    borderRadius: theme.radius.full,
    alignItems: "center",
    justifyContent: "center",
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
