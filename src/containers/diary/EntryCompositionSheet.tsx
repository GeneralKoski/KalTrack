import { DfAlert } from "@/src/components/DfAlert";
import { DfButton } from "@/src/components/form/DfButton";
import { EmptyState, SearchBar } from "@/src/components/kal";
import { useAppTheme } from "@/src/components/ThemeContext";
import { Text, TextInput } from "@/src/components/ui";
import {
  getEntryComposition,
  materializeComposition,
  saveEntryComposition,
} from "@/src/db/queries/diary";
import { createFood, getFood, searchFoods } from "@/src/db/queries/foods";
import { createRecipeFromComposition } from "@/src/db/queries/recipes";
import {
  addComponent,
  componentNutrients,
  compositionNutrients,
  removeComponent,
  setComponentGrams,
  type EntryComposition,
} from "@/src/domain/entryComposition";
import { EMPTY_NUTRIENTS, type Nutrients } from "@/src/domain/nutrition";
import { toGrams } from "@/src/domain/serving";
import { useTranslation } from "@/src/hooks/useTranslation";
import { theme } from "@/src/styles";
import { foodNutrients, type FoodRow } from "@/src/types/nutrition";
import { logger } from "@/src/utils/logger";
import { showToast } from "@/src/utils/toast";
import { ChevronLeft, Plus, Trash2 } from "lucide-react-native";
import React, { useCallback, useEffect, useState } from "react";
import { ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";

interface EntryCompositionSheetProps {
  isOpen: boolean;
  entryId: string | null;
  /** Il nome della voce: serve a proporre quello della variante. */
  title: string;
  servings: number;
  onSaved: () => void;
  onClose: () => void;
}

/** Risultati della ricerca: oltre non si scorre, si cerca. */
const SEARCH_LIMIT = 20;

const int = (value: number): string => String(Math.round(value));

/**
 * Le tre facce del foglio.
 *
 * Sono modalita' dello stesso foglio e non fogli annidati: un bottom sheet
 * dentro un modale su React Native e' fragile, e qui basta cambiare cosa si
 * disegna.
 */
type Mode = "list" | "add" | "create";

/**
 * Modifica la composizione di una voce del diario.
 *
 * La ricetta non viene toccata, e nemmeno le altre voci che la citano: quel che
 * si modifica qui e' la copia che questa voce si porta dietro.
 */
export const EntryCompositionSheet: React.FC<EntryCompositionSheetProps> = ({
  isOpen,
  entryId,
  title,
  servings,
  onSaved,
  onClose,
}) => {
  const { t } = useTranslation();
  const { colors } = useAppTheme();

  const [composition, setComposition] = useState<EntryComposition | null>(null);
  const [gramsText, setGramsText] = useState<Record<number, string>>({});
  const [mode, setMode] = useState<Mode>("list");
  const [busy, setBusy] = useState(false);

  const [term, setTerm] = useState("");
  const [results, setResults] = useState<FoodRow[]>([]);

  const [newName, setNewName] = useState("");
  const [newKcal, setNewKcal] = useState("");
  const [newProtein, setNewProtein] = useState("");
  const [newCarbs, setNewCarbs] = useState("");
  const [newFat, setNewFat] = useState("");

  /** Rimette i grammi come testo: si digita una cifra alla volta. */
  const adopt = useCallback((next: EntryComposition) => {
    setComposition(next);
    setGramsText(
      Object.fromEntries(next.items.map((item, i) => [i, int(item.quantityG)])),
    );
  }, []);

  useEffect(() => {
    if (!isOpen || !entryId) return;
    setMode("list");
    setTerm("");
    let active = true;
    materializeComposition(entryId)
      .then(async (found) => {
        if (!active) return;
        adopt(found ?? (await getEntryComposition(entryId)) ?? {
          edited: false,
          items: [],
        });
      })
      .catch((error) => {
        logger.error("[diario] composizione non leggibile", error);
      });
    return () => {
      active = false;
    };
  }, [isOpen, entryId, adopt]);

  useEffect(() => {
    if (mode !== "add") return;
    let active = true;
    searchFoods(term, SEARCH_LIMIT)
      .then((rows) => {
        if (active) setResults(rows);
      })
      .catch((error) => {
        logger.warn("[diario] ricerca alimenti fallita", error);
      });
    return () => {
      active = false;
    };
  }, [mode, term]);

  const aggiungi = (food: FoodRow) => {
    if (!composition) return;
    adopt(
      addComponent(composition, {
        foodId: food.id,
        label: food.name,
        quantityG: food.default_serving_g ?? 100,
        per100: foodNutrients(food),
      }),
    );
    setMode("list");
    setTerm("");
  };

  const creaAlimento = async () => {
    const nome = newName.trim();
    if (nome === "") return;
    setBusy(true);
    try {
      const nutrients: Nutrients = {
        ...EMPTY_NUTRIENTS,
        kcal: toGrams(newKcal),
        protein: toGrams(newProtein),
        carbs: toGrams(newCarbs),
        fat: toGrams(newFat),
      };
      const id = await createFood({ name: nome, nutrients });
      // Si rilegge invece di costruire una FoodRow a mano: l'alimento vero
      // porta i valori come li ha scritti il database, e un cast qui sarebbe
      // una riga da riallineare a ogni colonna nuova.
      const creato = await getFood(id);
      if (!creato) throw new Error("Alimento creato ma non rileggibile");
      aggiungi(creato);
      setNewName("");
      setNewKcal("");
      setNewProtein("");
      setNewCarbs("");
      setNewFat("");
    } catch (error) {
      logger.error("[diario] creazione alimento fallita", error);
      showToast.error({ title: t("general_error") });
    } finally {
      setBusy(false);
    }
  };

  const salva = async () => {
    if (!entryId || !composition || composition.items.length === 0) return;
    setBusy(true);
    try {
      await saveEntryComposition(entryId, composition);
      onSaved();
    } catch (error) {
      logger.error("[diario] salvataggio composizione fallito", error);
      showToast.error({ title: t("general_error") });
    } finally {
      setBusy(false);
    }
  };

  const salvaComeRicetta = async () => {
    if (!composition) return;
    setBusy(true);
    try {
      await createRecipeFromComposition({
        name: t("diary.composition_variant_name", { name: title }),
        servings,
        composition,
      });
      showToast.success({ title: t("diary.composition_saved_recipe") });
    } catch (error) {
      logger.error("[diario] variante non salvata come ricetta", error);
      showToast.error({ title: t("general_error") });
    } finally {
      setBusy(false);
    }
  };

  const totali = composition
    ? compositionNutrients(composition)
    : EMPTY_NUTRIENTS;
  const vuota = (composition?.items.length ?? 0) === 0;

  return (
    <DfAlert
      isOpen={isOpen}
      title={t("diary.composition_title")}
      confirmLabel={t("confirm")}
      onConfirm={() => void salva()}
      onClose={onClose}
      loading={busy}
      size="lg"
    >
      {mode === "list" ? (
        <View style={styles.body}>
          <ScrollView
            style={styles.list}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {composition?.items.map((item, index) => (
              <View
                key={`${item.label}-${index}`}
                style={[styles.row, { borderColor: colors.border }]}
              >
                <View style={styles.rowMain}>
                  <Text
                    style={[styles.label, { color: colors.text }]}
                    numberOfLines={1}
                  >
                    {item.label}
                  </Text>
                  <Text style={[styles.detail, { color: colors.textFaint }]}>
                    {`${int(componentNutrients(item).kcal)} kcal`}
                  </Text>
                </View>

                <TextInput
                  value={gramsText[index] ?? ""}
                  onChangeText={(text) => {
                    setGramsText((current) => ({ ...current, [index]: text }));
                    if (composition) {
                      setComposition(
                        setComponentGrams(composition, index, toGrams(text)),
                      );
                    }
                  }}
                  keyboardType="decimal-pad"
                  style={[
                    styles.grams,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                      color: colors.text,
                    },
                  ]}
                />
                <Text style={[styles.unit, { color: colors.textFaint }]}>
                  {t("photo_entry.grams")}
                </Text>

                <TouchableOpacity
                  onPress={() =>
                    composition && adopt(removeComponent(composition, index))
                  }
                  activeOpacity={0.6}
                  hitSlop={8}
                >
                  <Trash2 size={16} color={colors.textFaint} />
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>

          {vuota ? (
            <Text style={[styles.warning, { color: colors.textMuted }]}>
              {t("diary.composition_empty")}
            </Text>
          ) : (
            <Text style={[styles.total, { color: colors.text }]}>
              {t("photo_entry.total", {
                kcal: int(totali.kcal),
                protein: int(totali.protein),
                carbs: int(totali.carbs),
                fat: int(totali.fat),
              })}
            </Text>
          )}

          <DfButton
            label={t("diary.composition_add")}
            icon={<Plus size={18} color={colors.text} />}
            variant="outlined"
            onPress={() => setMode("add")}
            disabled={busy}
          />
          <DfButton
            label={t("diary.composition_save_recipe")}
            variant="ghost"
            onPress={() => void salvaComeRicetta()}
            disabled={busy || vuota}
          />
        </View>
      ) : null}

      {mode === "add" ? (
        <View style={styles.body}>
          <TouchableOpacity
            onPress={() => setMode("list")}
            activeOpacity={0.6}
            hitSlop={8}
            style={styles.back}
          >
            <ChevronLeft size={20} color={colors.textSecondary} />
            <Text style={[styles.backLabel, { color: colors.textSecondary }]}>
              {t("diary.composition_title")}
            </Text>
          </TouchableOpacity>

          <SearchBar value={term} onChangeText={setTerm} />

          <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
            {results.map((food) => (
              <TouchableOpacity
                key={food.id}
                onPress={() => aggiungi(food)}
                activeOpacity={0.6}
                style={[styles.row, { borderColor: colors.border }]}
              >
                <View style={styles.rowMain}>
                  <Text
                    style={[styles.label, { color: colors.text }]}
                    numberOfLines={1}
                  >
                    {food.name}
                  </Text>
                  <Text style={[styles.detail, { color: colors.textFaint }]}>
                    {`${int(food.kcal)} kcal / 100 g`}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
            {results.length === 0 ? (
              <EmptyState message={t("foods.empty")} />
            ) : null}
          </ScrollView>

          {/*
            La via d'uscita quando l'alimento non c'e'. Senza, si dovrebbe
            chiudere il foglio e andare in Alimenti, perdendo le modifiche.
          */}
          {term.trim() !== "" ? (
            <DfButton
              label={t("diary.quick_food_create", { name: term.trim() })}
              variant="outlined"
              onPress={() => {
                setNewName(term.trim());
                setMode("create");
              }}
            />
          ) : null}
        </View>
      ) : null}

      {mode === "create" ? (
        <View style={styles.body}>
          <TouchableOpacity
            onPress={() => setMode("add")}
            activeOpacity={0.6}
            hitSlop={8}
            style={styles.back}
          >
            <ChevronLeft size={20} color={colors.textSecondary} />
            <Text style={[styles.backLabel, { color: colors.textSecondary }]}>
              {t("diary.quick_food_title")}
            </Text>
          </TouchableOpacity>

          <Text style={[styles.detail, { color: colors.textMuted }]}>
            {t("diary.quick_food_hint")}
          </Text>

          <TextInput
            value={newName}
            onChangeText={setNewName}
            placeholder={t("foods.name")}
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

          <View style={styles.macros}>
            {[
              [newKcal, setNewKcal, t("diary.kcal_short")] as const,
              [newProtein, setNewProtein, t("diary.protein_short")] as const,
              [newCarbs, setNewCarbs, t("diary.carbs_short")] as const,
              [newFat, setNewFat, t("diary.fat_short")] as const,
            ].map(([value, setValue, placeholder]) => (
              <TextInput
                key={placeholder}
                value={value}
                onChangeText={setValue}
                placeholder={placeholder}
                placeholderTextColor={colors.textFaint}
                keyboardType="decimal-pad"
                style={[
                  styles.input,
                  styles.macroInput,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                    color: colors.text,
                  },
                ]}
              />
            ))}
          </View>

          <DfButton
            label={t("save")}
            onPress={() => void creaAlimento()}
            loading={busy}
            disabled={newName.trim() === ""}
          />
        </View>
      ) : null}
    </DfAlert>
  );
};

const styles = StyleSheet.create({
  body: { gap: theme.spacing.sm },
  // Un tetto e non `flex: 1`: dentro DfAlert una lista senza altezza propria
  // cresce fino a spingere fuori il piede col bottone Conferma.
  list: { maxHeight: 300 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowMain: { flex: 1, gap: 2 },
  label: { fontSize: 14, fontWeight: "600" },
  detail: { fontSize: 11 },
  grams: {
    borderWidth: 1,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 6,
    fontSize: 14,
    minWidth: 56,
    textAlign: "right",
  },
  unit: { fontSize: 10 },
  total: { fontSize: 14, fontWeight: "700" },
  warning: { fontSize: 12, lineHeight: 17 },
  back: { flexDirection: "row", alignItems: "center", gap: 4 },
  backLabel: { fontSize: 13, fontWeight: "600" },
  input: {
    borderWidth: 1,
    borderRadius: theme.radius.lg,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    fontSize: 15,
  },
  macros: { flexDirection: "row", gap: theme.spacing.sm },
  macroInput: { flex: 1, textAlign: "center" },
});
