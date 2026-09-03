import { DfAlert } from "@/src/components/DfAlert";
import { FormScreen } from "@/src/components/FormScreen";
import { DfButton } from "@/src/components/form/DfButton";
import { PhotoField, ScreenBackground, SectionLabel } from "@/src/components/kal";
import { useAppTheme } from "@/src/components/ThemeContext";
import { Text, TextInput } from "@/src/components/ui";
import {
  IngredientPicker,
  type PickedIngredient,
} from "@/src/containers/recipes/IngredientPicker";
import { IngredientRow } from "@/src/containers/recipes/IngredientRow";
import { NutritionSummary } from "@/src/containers/recipes/NutritionSummary";
import { QuantityPrompt } from "@/src/containers/recipes/QuantityPrompt";
import { getFood } from "@/src/db/queries/foods";
import {
  buildRecipeTree,
  createRecipe,
  deleteRecipe,
  getRecipe,
  getRecipeItems,
  RecipeCycleError,
  RecipeDepthError,
  updateRecipe,
} from "@/src/db/queries/recipes";
import {
  recipePerServing,
  scaleNutrients,
  sumNutrients,
  type Nutrients,
} from "@/src/domain/nutrition";
import { useAppNav } from "@/src/hooks/useAppNav";
import { useTranslation } from "@/src/hooks/useTranslation";
import { theme } from "@/src/styles";
import { foodNutrients, type RecipeItemInput } from "@/src/types/nutrition";
import { showToast } from "@/src/utils/toast";
import { sanitizeDecimalInput } from "@/src/utils/utils";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import { useRoute, type RouteProp } from "@react-navigation/native";
import { ChevronLeft, Plus, Trash2 } from "lucide-react-native";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

/**
 * Un ingrediente nel form: porta con sé nome e valori risolti, così i totali si
 * ricalcolano in memoria a ogni tasto senza rileggere il database.
 */
type DraftItem =
  | {
      kind: "food";
      foodId: string;
      name: string;
      per100: Nutrients;
      grams: number;
    }
  | {
      kind: "recipe";
      recipeId: string;
      name: string;
      perServing: Nutrients;
      servings: number;
    };

const toInput = (item: DraftItem): RecipeItemInput =>
  item.kind === "food"
    ? { foodId: item.foodId, quantityG: item.grams }
    : { childRecipeId: item.recipeId, servings: item.servings };

const itemNutrients = (item: DraftItem): Nutrients =>
  item.kind === "food"
    ? scaleNutrients(item.per100, item.grams)
    : scaleNutrients(item.perServing, item.servings * 100);

export function RecipeFormScreen() {
  const { t } = useTranslation();
  const { goBack } = useAppNav();
  const { colors } = useAppTheme();
  const route = useRoute<RouteProp<{ params: { id?: string } }, "params">>();
  const id = route.params?.id;
  const pickerRef = useRef<BottomSheetModal>(null);

  const [loading, setLoading] = useState(Boolean(id));
  const [name, setName] = useState("");
  const [servingsText, setServingsText] = useState("1");
  const [notes, setNotes] = useState("");
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [items, setItems] = useState<DraftItem[]>([]);
  const [pending, setPending] = useState<PickedIngredient | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    let active = true;
    (async () => {
      const [recipe, rows] = await Promise.all([
        getRecipe(id),
        getRecipeItems(id),
      ]);
      if (!active || !recipe) {
        if (active) setLoading(false);
        return;
      }
      setName(recipe.name);
      setServingsText(String(recipe.servings));
      setNotes(recipe.notes ?? "");
      setPhotoUri(recipe.photo_uri);

      const drafts: DraftItem[] = [];
      for (const row of rows) {
        if (row.food_id) {
          const food = await getFood(row.food_id);
          if (!food) continue;
          drafts.push({
            kind: "food",
            foodId: food.id,
            name: food.name,
            per100: foodNutrients(food),
            grams: row.quantity_g ?? 0,
          });
        } else if (row.child_recipe_id) {
          const child = await getRecipe(row.child_recipe_id);
          const tree = await buildRecipeTree(row.child_recipe_id);
          if (!child || !tree) continue;
          drafts.push({
            kind: "recipe",
            recipeId: child.id,
            name: child.name,
            perServing: recipePerServing(tree),
            servings: row.servings ?? 0,
          });
        }
      }
      if (active) {
        setItems(drafts);
        setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [id]);

  const servings = Number(servingsText.replace(",", ".")) || 1;

  // Ogni DraftItem porta già i propri valori risolti, quindi i totali sono una
  // somma diretta: nessuna lettura dal DB mentre si digita.
  const totals = useMemo(
    () => sumNutrients(items.map(itemNutrients)),
    [items],
  );

  const onPick = (picked: PickedIngredient) => {
    pickerRef.current?.dismiss();
    setPending(picked);
  };

  const confirmQuantity = async (value: number) => {
    if (editingIndex !== null) {
      setItems((prev) =>
        prev.map((item, index) =>
          index !== editingIndex
            ? item
            : item.kind === "food"
              ? { ...item, grams: value }
              : { ...item, servings: value },
        ),
      );
      setEditingIndex(null);
      return;
    }
    if (!pending) return;

    if (pending.kind === "food") {
      setItems((prev) => [
        ...prev,
        {
          kind: "food",
          foodId: pending.food.id,
          name: pending.food.name,
          per100: foodNutrients(pending.food),
          grams: value,
        },
      ]);
    } else {
      // I valori della ricetta annidata si risolvono ora, una volta sola: da qui
      // in poi l'ingrediente è autosufficiente e i totali restano sincroni.
      const childTree = await buildRecipeTree(pending.recipe.id);
      if (!childTree) {
        showToast.error({ title: t("general_error") });
        setPending(null);
        return;
      }
      setItems((prev) => [
        ...prev,
        {
          kind: "recipe",
          recipeId: pending.recipe.id,
          name: pending.recipe.name,
          perServing: recipePerServing(childTree),
          servings: value,
        },
      ]);
    }
    setPending(null);
  };

  const onSave = async () => {
    if (!name.trim()) {
      showToast.error({ title: t("recipes.name_required") });
      return;
    }
    setSaving(true);
    try {
      const input = {
        name: name.trim(),
        servings,
        notes: notes.trim() || null,
        photoUri,
        items: items.map(toInput),
      };
      if (id) {
        await updateRecipe(id, input);
      } else {
        await createRecipe(input);
      }
      showToast.success({ title: t("recipes.saved") });
      goBack();
    } catch (error) {
      if (error instanceof RecipeCycleError) {
        showToast.error({ title: t("recipes.cycle_error") });
      } else if (error instanceof RecipeDepthError) {
        showToast.error({ title: t("recipes.depth_error") });
      } else {
        showToast.error({ title: t("general_error") });
      }
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (!id) return;
    await deleteRecipe(id);
    setConfirmDelete(false);
    showToast.success({ title: t("recipes.deleted") });
    goBack();
  };

  const promptOpen = pending !== null || editingIndex !== null;
  const promptTarget =
    editingIndex !== null ? items[editingIndex] : null;

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
            {id ? t("recipes.edit_title") : t("recipes.new_title")}
          </Text>
        </View>

        {loading ? (
          <ActivityIndicator style={styles.loader} color={colors.accent} />
        ) : (
          <FormScreen contentContainerStyle={styles.content} bottomSpacing={theme.spacing.lg}>
            <Text style={[styles.label, { color: colors.textMuted }]}>
              {t("recipes.name")}
            </Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder={t("recipes.name_placeholder")}
              placeholderTextColor={colors.textFaint}
              style={[
                styles.input,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  color: colors.text,
                },
              ]}
            />

            <Text style={[styles.label, { color: colors.textMuted }]}>
              {t("recipes.servings")}
            </Text>
            <TextInput
              value={servingsText}
              onChangeText={(text) => setServingsText(sanitizeDecimalInput(text))}
              keyboardType="decimal-pad"
              placeholderTextColor={colors.textFaint}
              style={[
                styles.input,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  color: colors.text,
                },
              ]}
            />

            <View style={styles.photo}>
              <PhotoField uri={photoUri} onChange={setPhotoUri} prefix="recipe" />
            </View>

            <SectionLabel style={styles.section}>
              {t("recipes.ingredients")}
            </SectionLabel>

            {items.map((item, index) => (
              <IngredientRow
                key={`${item.kind}-${index}`}
                name={item.name}
                quantityLabel={
                  item.kind === "food"
                    ? `${item.grams} g`
                    : t("recipes.servings_count", { count: item.servings })
                }
                kcal={itemNutrients(item).kcal}
                isRecipe={item.kind === "recipe"}
                isLast={index === items.length - 1}
                onPress={() => setEditingIndex(index)}
                onRemove={() =>
                  setItems((prev) => prev.filter((_, i) => i !== index))
                }
              />
            ))}

            <DfButton
              label={t("recipes.add_ingredient")}
              variant="outlined"
              icon={<Plus size={18} color={colors.accent} />}
              onPress={() => pickerRef.current?.present()}
              style={styles.addButton}
            />

            <NutritionSummary totals={totals} servings={servings} />

            <Text style={[styles.label, { color: colors.textMuted }]}>
              {t("recipes.notes")}
            </Text>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              multiline
              placeholderTextColor={colors.textFaint}
              style={[
                styles.input,
                styles.notes,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  color: colors.text,
                },
              ]}
            />

            <DfButton
              label={t("save")}
              loading={saving}
              onPress={onSave}
              style={styles.save}
            />

            {id ? (
              <DfButton
                label={t("delete")}
                variant="outlined"
                color={theme.colors.error}
                icon={<Trash2 size={18} color={theme.colors.error} />}
                onPress={() => setConfirmDelete(true)}
                style={styles.deleteButton}
              />
            ) : null}
          </FormScreen>
        )}
      </SafeAreaView>

      <IngredientPicker
        ref={pickerRef}
        excludeRecipeId={id}
        onPick={onPick}
      />

      <QuantityPrompt
        isOpen={promptOpen}
        title={
          promptTarget?.name ??
          (pending?.kind === "food" ? pending.food.name : pending?.recipe.name) ??
          ""
        }
        unit={
          (promptTarget?.kind ?? pending?.kind) === "food"
            ? "g"
            : t("recipes.servings_unit")
        }
        initialValue={
          promptTarget
            ? promptTarget.kind === "food"
              ? promptTarget.grams
              : promptTarget.servings
            : pending?.kind === "food"
              ? (pending.food.default_serving_g ?? 100)
              : 1
        }
        serving={
          pending?.kind === "food" && pending.food.default_serving_g
            ? {
                grams: pending.food.default_serving_g,
                label: pending.food.serving_label,
              }
            : null
        }
        onConfirm={confirmQuantity}
        onClose={() => {
          setPending(null);
          setEditingIndex(null);
        }}
      />

      <DfAlert
        isOpen={confirmDelete}
        title={t("recipes.delete_title")}
        message={t("recipes.delete_message")}
        confirmLabel={t("delete")}
        confirmColor={theme.colors.error}
        onConfirm={onDelete}
        onClose={() => setConfirmDelete(false)}
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
  title: {
    flex: 1,
    fontSize: 18,
    fontWeight: "700",
  },
  content: {
    flexGrow: 1,
    padding: theme.spacing.md,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.xs,
  },
  input: {
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    fontSize: 15,
  },
  notes: {
    minHeight: 72,
    textAlignVertical: "top",
  },
  photo: {
    marginTop: theme.spacing.md,
  },
  section: {
    marginTop: theme.spacing.lg,
  },
  addButton: {
    marginTop: theme.spacing.md,
  },
  save: {
    marginTop: theme.spacing.lg,
  },
  deleteButton: {
    marginTop: theme.spacing.sm,
  },
  loader: {
    marginTop: theme.spacing.xl,
  },
});
