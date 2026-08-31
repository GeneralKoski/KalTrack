import { hasGroqKey } from "@/src/ai/config";
import { MissingApiKeyError } from "@/src/ai/errors";
import {
  estimateFromPhoto,
  type PhotoEstimate,
} from "@/src/ai/estimateFromPhoto";
import {
  Card,
  EmptyState,
  MetalSurface,
  ScreenBackground,
} from "@/src/components/kal";
import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import {
  ASSISTANT_FAB_CLEARANCE,
  AssistantButton,
  SCREEN_FAB_BOTTOM,
  SCREEN_FAB_SIZE,
} from "@/src/containers/assistant/AssistantButton";
import {
  AddEntrySheet,
  type DiaryPick,
} from "@/src/containers/diary/AddEntrySheet";
import { CalorieRing } from "@/src/containers/diary/CalorieRing";
import { DayHeader } from "@/src/containers/diary/DayHeader";
import { DayPickerSheet } from "@/src/containers/diary/DayPickerSheet";
import { EntryCompositionSheet } from "@/src/containers/diary/EntryCompositionSheet";
import { FreeEntrySheet } from "@/src/containers/diary/FreeEntrySheet";
import { MacroBars } from "@/src/containers/diary/MacroBars";
import { MealSection } from "@/src/containers/diary/MealSection";
import { PhotoEstimateSheet } from "@/src/containers/diary/PhotoEstimateSheet";
import { QuantityPrompt } from "@/src/containers/recipes/QuantityPrompt";
import { AiKeyPrompt } from "@/src/containers/settings/AiKeyPrompt";
import { DayStatCard } from "@/src/containers/tracking/DayStatCard";
import { QuickLogSheet } from "@/src/containers/tracking/QuickLogSheet";
import { WaterCard } from "@/src/containers/wellbeing/WaterCard";
import {
  addFoodEntry,
  addFreeEntry,
  addRecipeEntry,
  deleteEntry,
  entryDisplayNames,
  getDayDiary,
  listMealTypes,
  updateEntryQuantity,
  type DayDiary,
} from "@/src/db/queries/diary";
import { getFood } from "@/src/db/queries/foods";
import { getTargetsFor } from "@/src/db/queries/settings";
import {
  deleteSteps,
  deleteWeight,
  getSteps,
  getWeight,
  setSteps,
  setWeight,
} from "@/src/db/queries/tracking";
import { todayIso } from "@/src/domain/date";
import { EMPTY_NUTRIENTS, type Nutrients } from "@/src/domain/nutrition";
import { rowNutrients, type EstimateRow } from "@/src/domain/photoEstimate";
import { useAppNav } from "@/src/hooks/useAppNav";
import { useFocusData } from "@/src/hooks/useFocusData";
import { useTranslation } from "@/src/hooks/useTranslation";
import { discardPhoto, persistPhoto } from "@/src/services/photoStorage";
import { useDayContextStore } from "@/src/stores/dayContextStore";
import { theme } from "@/src/styles";
import type {
  FoodRow,
  MealEntryRow,
  MealTypeRow,
  TargetRow,
} from "@/src/types/nutrition";
import { logger } from "@/src/utils/logger";
import { showToast } from "@/src/utils/toast";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import { useFocusEffect } from "@react-navigation/native";
import * as ImagePicker from "expo-image-picker";
import { Footprints, Plus, Scale, UtensilsCrossed } from "lucide-react-native";
import React, { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

interface DayData {
  diary: DayDiary;
  /** Nome risolto di ogni riga, indicizzato per id della riga. */
  names: Record<string, string>;
  mealTypes: MealTypeRow[];
  /** Obiettivo in vigore in quel giorno, non quello di oggi. */
  targets: TargetRow | null;
  /** Null, non zero, quando il giorno non ha una misura. */
  steps: number | null;
  weightKg: number | null;
}

export function TodayScreen() {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const { navigate } = useAppNav();
  const today = todayIso();

  const [date, setDate] = useState(today);
  const [pendingPick, setPendingPick] = useState<DiaryPick | null>(null);
  const [editingEntry, setEditingEntry] = useState<MealEntryRow | null>(null);
  const [editingFood, setEditingFood] = useState<FoodRow | null>(null);
  const [freeOpen, setFreeOpen] = useState(false);
  /**
   * Stima da foto. `photoUri` e' quella GIA' copiata in archivio permanente:
   * l'URI che torna dal picker sta in cache, e il sistema la svuota quando ha
   * bisogno di spazio - la riga resterebbe a puntare al nulla.
   */
  const [photoEstimate, setPhotoEstimate] = useState<PhotoEstimate | null>(
    null,
  );
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  /** La voce di cui si sta modificando la composizione. */
  const [composing, setComposing] = useState<MealEntryRow | null>(null);
  const [askKey, setAskKey] = useState(false);
  const [stepsOpen, setStepsOpen] = useState(false);
  const [weightOpen, setWeightOpen] = useState(false);
  const [mealTypeId, setMealTypeId] = useState<string | null>(null);
  const addSheetRef = useRef<BottomSheetModal>(null);
  const dayPickerRef = useRef<BottomSheetModal>(null);
  // Cambia a ogni apertura del calendario: e' quel che gli fa rileggere gli
  // anelli invece di mostrare quelli di quando e' stato montato.
  const [dayPickerKey, setDayPickerKey] = useState(0);

  // L'assistente e' montato sopra la navigazione e non vede questo stato:
  // glielo passiamo, altrimenti scriverebbe sempre su oggi anche mentre si
  // sta guardando un altro giorno.
  const setReferenceDate = useDayContextStore((s) => s.setReferenceDate);
  useFocusEffect(
    useCallback(() => {
      setReferenceDate(date);
      return () => setReferenceDate(null);
    }, [date, setReferenceDate]),
  );

  const loader = useCallback(async (): Promise<DayData> => {
    const [diary, mealTypes, targets, stepRow, weightRow] = await Promise.all([
      getDayDiary(date),
      listMealTypes(),
      getTargetsFor(date),
      getSteps(date),
      getWeight(date),
    ]);

    const names = await entryDisplayNames(diary);

    return {
      diary,
      names,
      mealTypes,
      targets,
      steps: stepRow?.steps ?? null,
      weightKg: weightRow?.weight_kg ?? null,
    };
  }, [date]);

  const { data, loading, reload } = useFocusData<DayData>(loader);

  const openAdd = (typeId?: string) => {
    setMealTypeId(typeId ?? data?.mealTypes[0]?.id ?? null);
    addSheetRef.current?.present();
  };

  const onPick = (picked: DiaryPick) => {
    addSheetRef.current?.dismiss();
    if (picked.kind === "free") {
      setFreeOpen(true);
      return;
    }
    if (picked.kind === "photo") {
      void startPhotoEstimate(picked.source);
      return;
    }
    setPendingPick(picked);
  };

  const startPhotoEstimate = async (source: "camera" | "library") => {
    // Chiesta prima di aprire la fotocamera: scattare una foto per poi
    // sentirsi dire che manca la chiave e' lavoro buttato.
    if (!hasGroqKey()) {
      setAskKey(true);
      return;
    }
    if (source === "camera") {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) return;
    }

    const picked =
      source === "camera"
        ? await ImagePicker.launchCameraAsync({ quality: 0.8 })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ["images"],
            quality: 0.8,
          });
    if (picked.canceled || !picked.assets[0]) return;

    // Copia PRIMA della stima: se la stima fallisce la foto e' comunque al
    // sicuro, e se riesce non c'e' un secondo passaggio che possa cadere.
    const uri = await persistPhoto(picked.assets[0].uri, "meal");
    setPhotoUri(uri);
    setPhotoEstimate(null);
    setPhotoBusy(true);
    try {
      setPhotoEstimate(await estimateFromPhoto({ uri }));
    } catch (error) {
      setPhotoBusy(false);
      setPhotoUri(null);
      await discardPhoto(uri);
      if (error instanceof MissingApiKeyError) {
        setAskKey(true);
        return;
      }
      logger.error("[foto] stima del pasto fallita", error);
      showToast.error({ title: t("photo_entry.failed") });
      return;
    }
    setPhotoBusy(false);
  };

  const closePhotoEstimate = async () => {
    // La foto e' stata copiata in archivio per una voce che non e' mai nata:
    // senza questo resta un file che nessuno referenzia e nessuno cancella.
    const orfana = photoUri;
    setPhotoEstimate(null);
    setPhotoUri(null);
    setPhotoBusy(false);
    await discardPhoto(orfana);
  };

  const confirmPhotoEstimate = async (rows: EstimateRow[]) => {
    if (!mealTypeId) return;
    try {
      for (const row of rows) {
        await addFreeEntry({
          date,
          mealTypeId,
          label: row.label.trim(),
          nutrients: rowNutrients(row),
          isEstimated: !row.fromCatalog,
          confidence: row.confidence,
          photoUri,
          createdVia: "photo",
        });
      }
      setPhotoEstimate(null);
      setPhotoUri(null);
      reload();
    } catch (error) {
      logger.error("[foto] salvataggio delle voci stimate fallito", error);
      showToast.error({ title: t("general_error") });
    }
  };

  const confirmQuantity = async (value: number) => {
    try {
      if (editingEntry) {
        await updateEntryQuantity(editingEntry.id, value);
        setEditingEntry(null);
      } else if (pendingPick && mealTypeId) {
        if (pendingPick.kind === "food") {
          await addFoodEntry({
            date,
            mealTypeId,
            foodId: pendingPick.food.id,
            quantityG: value,
          });
        } else if (pendingPick.kind === "recipe") {
          await addRecipeEntry({
            date,
            mealTypeId,
            recipeId: pendingPick.recipe.id,
            servings: value,
          });
        }
        setPendingPick(null);
      }
      reload();
    } catch {
      showToast.error({ title: t("general_error") });
    }
  };

  const confirmFree = async (label: string, nutrients: Nutrients) => {
    if (!mealTypeId) return;
    try {
      await addFreeEntry({
        date,
        mealTypeId,
        label,
        nutrients,
        isEstimated: true,
      });
      setFreeOpen(false);
      reload();
    } catch {
      showToast.error({ title: t("general_error") });
    }
  };

  const onEditComposition = (entryId: string) => {
    const entry = data?.diary.meals
      .flatMap((m) => m.entries)
      .find((e) => e.id === entryId);
    if (entry) setComposing(entry);
  };

  const onDeleteEntry = async (entryId: string) => {
    await deleteEntry(entryId);
    reload();
  };

  const onEditEntry = async (entryId: string) => {
    const entry = data?.diary.meals
      .flatMap((m) => m.entries)
      .find((e) => e.id === entryId);
    if (!entry) return;
    setEditingEntry(entry);
    if (entry.food_id) {
      const food = await getFood(entry.food_id);
      setEditingFood(food);
    } else {
      setEditingFood(null);
    }
  };

  const promptOpen = pendingPick !== null || editingEntry !== null;
  const promptIsRecipe =
    editingEntry?.source_kind === "recipe" || pendingPick?.kind === "recipe";
  // Una voce libera si scala per moltiplicatore, non per grammi: chiederle
  // "quanti g?" e passare il numero a updateEntryQuantity moltiplicava lo
  // snapshot per quel numero.
  const promptIsFree = editingEntry?.source_kind === "free";

  const promptTitle = editingEntry
    ? (data?.names[editingEntry.id] ?? "")
    : pendingPick?.kind === "food"
      ? pendingPick.food.name
      : pendingPick?.kind === "recipe"
        ? pendingPick.recipe.name
        : "";

  const promptValue = editingEntry
    ? (editingEntry.servings ?? editingEntry.quantity_g ?? 100)
    : pendingPick?.kind === "food"
      ? (pendingPick.food.default_serving_g ?? 100)
      : 1;

  /**
   * Le scorciatoie della porzione, solo per un alimento appena scelto.
   *
   * Non per una voce che si sta modificando: la riga del diario porta la
   * quantita', non la porzione dell'alimento da cui e' nata, e risalirci
   * vorrebbe dire una lettura in piu' a prompt aperto.
   */
  const promptServing =
    pendingPick?.kind === "food" && pendingPick.food.default_serving_g
      ? {
          grams: pendingPick.food.default_serving_g,
          label: pendingPick.food.serving_label,
        }
      : null;

  const totals = data?.diary.totals;

  return (
    <View style={styles.root}>
      <ScreenBackground />
      <SafeAreaView edges={["top", "left", "right"]} style={styles.safe}>
        <DayHeader
          date={date}
          today={today}
          onChange={setDate}
          onOpenPicker={() => {
            setDayPickerKey((k) => k + 1);
            dayPickerRef.current?.present();
          }}
        />

        {loading && !data ? (
          <ActivityIndicator style={styles.loader} color={colors.accent} />
        ) : (
          <ScrollView
            contentContainerStyle={[
              styles.content,
              { paddingBottom: ASSISTANT_FAB_CLEARANCE },
            ]}
          >
            <Card style={styles.summary}>
              <CalorieRing
                consumed={totals?.kcal ?? 0}
                target={data?.targets?.kcal ?? null}
                nutrients={totals ?? null}
              />

              {data?.targets ? null : (
                <TouchableOpacity
                  onPress={() => navigate("Targets")}
                  activeOpacity={0.6}
                >
                  <Text style={[styles.setTarget, { color: colors.accent }]}>
                    {t("diary.set_target")}
                  </Text>
                </TouchableOpacity>
              )}

              <MacroBars
                consumed={totals ?? EMPTY_NUTRIENTS}
                targets={
                  data?.targets
                    ? {
                        proteinG: data.targets.protein_g,
                        carbsG: data.targets.carbs_g,
                        fatG: data.targets.fat_g,
                      }
                    : null
                }
              />
            </Card>

            <View style={styles.stats}>
              <DayStatCard
                icon={Footprints}
                label={t("tracking.steps")}
                value={data?.steps ?? null}
                unit={t("tracking.steps_unit")}
                target={data?.targets?.steps ?? null}
                emptyLabel={t("tracking.not_recorded")}
                onPress={() => setStepsOpen(true)}
              />
              <DayStatCard
                icon={Scale}
                label={t("tracking.weight")}
                value={data?.weightKg ?? null}
                unit="kg"
                emptyLabel={t("tracking.not_recorded")}
                onPress={() => setWeightOpen(true)}
              />
            </View>

            {/* L'acqua e' un dato del giorno come i passi: sta qui, dove si
                guarda ogni volta, non dietro una voce di menu. */}
            <WaterCard date={date} />

            {data && data.diary.meals.length === 0 ? (
              <EmptyState
                message={t("diary.empty")}
                icon={<UtensilsCrossed size={40} color={colors.textFaint} />}
              />
            ) : (
              data?.diary.meals.map((meal) => (
                <MealSection
                  key={meal.meal.id}
                  meal={meal}
                  names={data.names}
                  onAdd={() => openAdd(meal.type.id)}
                  onEditEntry={onEditEntry}
                  onEditComposition={onEditComposition}
                  onDeleteEntry={onDeleteEntry}
                />
              ))
            )}
          </ScrollView>
        )}
      </SafeAreaView>

      <TouchableOpacity
        style={styles.fab}
        activeOpacity={0.6}
        onPress={() => openAdd()}
      >
        <MetalSurface radius={28} style={styles.fabSurface}>
          <Plus size={26} color={colors.text} strokeWidth={2.5} />
        </MetalSurface>
      </TouchableOpacity>

      {/* L'assistente sta qui e non sopra la navigazione: scrive pasti, passi,
          peso e obiettivi, cioè quel che vive in questa schermata. */}
      <AssistantButton onIntentExecuted={reload} />

      <DayPickerSheet
        ref={dayPickerRef}
        date={date}
        today={today}
        refreshKey={dayPickerKey}
        onPick={(giorno) => {
          setDate(giorno);
          dayPickerRef.current?.dismiss();
        }}
      />

      <AddEntrySheet
        ref={addSheetRef}
        mealTypes={data?.mealTypes ?? []}
        mealTypeId={mealTypeId}
        onChangeMealType={setMealTypeId}
        onPick={onPick}
      />

      <QuantityPrompt
        isOpen={promptOpen}
        title={promptTitle}
        unit={
          promptIsRecipe
            ? t("recipes.servings_unit")
            : promptIsFree
              ? t("diary.multiplier_unit")
              : "g"
        }
        initialValue={promptValue}
        serving={promptServing}
        food={pendingPick?.kind === "food" ? pendingPick.food : editingFood}
        onConfirm={confirmQuantity}
        onClose={() => {
          setPendingPick(null);
          setEditingEntry(null);
          setEditingFood(null);
        }}
      />

      <FreeEntrySheet
        isOpen={freeOpen}
        onConfirm={confirmFree}
        onClose={() => setFreeOpen(false)}
      />

      <AiKeyPrompt isOpen={askKey} onClose={() => setAskKey(false)} />

      <EntryCompositionSheet
        isOpen={composing !== null}
        entryId={composing?.id ?? null}
        title={composing ? (data?.names[composing.id] ?? "") : ""}
        servings={composing?.servings ?? 1}
        onSaved={() => {
          setComposing(null);
          reload();
        }}
        onClose={() => setComposing(null)}
      />

      <PhotoEstimateSheet
        isOpen={photoBusy || photoEstimate !== null}
        estimate={photoEstimate}
        loading={photoBusy}
        onConfirm={confirmPhotoEstimate}
        onClose={() => void closePhotoEstimate()}
      />

      <QuickLogSheet
        isOpen={stepsOpen}
        title={t("tracking.steps")}
        unit={t("tracking.steps_unit")}
        initialValue={data?.steps ?? null}
        onConfirm={async (value) => {
          await setSteps(date, value);
          setStepsOpen(false);
          reload();
        }}
        onDelete={
          data?.steps != null
            ? async () => {
                await deleteSteps(date);
                setStepsOpen(false);
                reload();
              }
            : undefined
        }
        onClose={() => setStepsOpen(false)}
      />

      <QuickLogSheet
        isOpen={weightOpen}
        title={t("tracking.weight")}
        unit="kg"
        initialValue={data?.weightKg ?? null}
        onConfirm={async (value) => {
          await setWeight(date, value);
          setWeightOpen(false);
          reload();
        }}
        onDelete={
          data?.weightKg != null
            ? async () => {
                await deleteWeight(date);
                setWeightOpen(false);
                reload();
              }
            : undefined
        }
        onClose={() => setWeightOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  content: {
    paddingHorizontal: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  summary: {
    gap: theme.spacing.sm,
  },
  stats: {
    flexDirection: "row",
    gap: theme.spacing.sm,
  },
  setTarget: {
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
  },
  loader: {
    marginTop: theme.spacing.xl,
  },
  fab: {
    position: "absolute",
    right: theme.spacing.md,
    bottom: SCREEN_FAB_BOTTOM,
    borderRadius: 28,
    shadowColor: theme.colors.gray900,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  fabSurface: {
    width: SCREEN_FAB_SIZE,
    height: SCREEN_FAB_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
});
