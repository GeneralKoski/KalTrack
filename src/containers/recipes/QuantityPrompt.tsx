import { DfAlert } from "@/src/components/DfAlert";
import { useAppTheme } from "@/src/components/ThemeContext";
import { Text, TextInput } from "@/src/components/ui";
import { FoodThumb, MacroTriple } from "@/src/containers/foods/FoodFacts";
import { formatGrams } from "@/src/domain/serving";
import { useTranslation } from "@/src/hooks/useTranslation";
import { theme } from "@/src/styles";
import type { FoodRow } from "@/src/types/nutrition";
import { sanitizeDecimalInput } from "@/src/utils/utils";
import React, { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

interface QuantityPromptProps {
  isOpen: boolean;
  title: string;
  /** "g" per un alimento, "porzioni" per una ricetta annidata. */
  unit: string;
  initialValue: number;
  /**
   * L'alimento che si sta pesando, quando e' un alimento.
   *
   * Serve a vedere COSA si sta scrivendo mentre lo si scrive: senza, la
   * finestra chiedeva quanti grammi di una cosa di cui non mostrava niente, e
   * per controllare le calorie bisognava annullare e andare a cercarla.
   */
  food?: FoodRow | null;
  onConfirm: (value: number) => void;
  onClose: () => void;
}

/**
 * Quanto se ne prende.
 *
 * Un numero solo si scrive, e uno solo si legge: sopra il campo c'e' cosa si
 * sta pesando (foto, marca, il riferimento per cento), sotto quel che ne viene
 * fuori. I valori per cento e quelli della quantita' scritta stavano tutti e
 * due nel corpo della finestra, in due riquadri distinti, e a colpo d'occhio
 * non si sapeva quale delle due basi si stesse guardando.
 *
 * **La grammatura si scrive e basta.** Sotto il campo c'erano quattro
 * scorciatoie (1/2, 1, 2, 3) che moltiplicavano la porzione dell'alimento: la
 * porzione resta scritta sopra come promemoria - e resta il numero gia' nel
 * campo all'apertura - ma i grammi si digitano.
 */
export const QuantityPrompt: React.FC<QuantityPromptProps> = ({
  isOpen,
  title,
  unit,
  initialValue,
  food = null,
  onConfirm,
  onClose,
}) => {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const [text, setText] = useState(String(initialValue));

  useEffect(() => {
    if (isOpen) setText(String(initialValue));
  }, [isOpen, initialValue]);

  const parsed = Number(text.replace(",", "."));
  const valid = Number.isFinite(parsed) && parsed > 0;
  /** Quanto vale il campo per chi disegna: un campo vuoto e' zero, non nulla. */
  const quantity = valid ? parsed : 0;

  /** La porzione dell'alimento, scritta per esteso: e' un promemoria, non un
      bottone. */
  const servingHint = food?.default_serving_g
    ? food.serving_label?.trim()
      ? food.serving_label
      : t("quantity.serving_is", {
          grams: formatGrams(food.default_serving_g),
        })
    : null;

  return (
    <DfAlert
      isOpen={isOpen}
      title={title}
      confirmLabel={t("confirm")}
      onConfirm={() => valid && onConfirm(parsed)}
      onClose={onClose}
    >
      {food ? (
        <View style={styles.head}>
          <FoodThumb food={food} size={44} />
          <View style={styles.headText}>
            {food.brand ? (
              <Text
                style={[styles.brand, { color: colors.textMuted }]}
                numberOfLines={1}
              >
                {food.brand}
              </Text>
            ) : null}
            <Text style={[styles.reference, { color: colors.textSecondary }]}>
              {t("quantity.reference", {
                kcal: Math.round(food.kcal),
                unit: food.is_liquid === 1 ? "ml" : "g",
              })}
            </Text>
            {servingHint ? (
              <Text
                style={[styles.reference, { color: colors.textFaint }]}
                numberOfLines={1}
              >
                {servingHint}
              </Text>
            ) : null}
          </View>
        </View>
      ) : null}

      <View style={styles.row}>
        <TextInput
          value={text}
          onChangeText={(value) => setText(sanitizeDecimalInput(value))}
          keyboardType="decimal-pad"
          selectTextOnFocus
          autoFocus
          placeholderTextColor={colors.textFaint}
          style={[
            styles.input,
            { borderColor: colors.border, color: colors.text },
          ]}
        />
        <Text style={[styles.unit, { color: colors.textMuted }]}>{unit}</Text>
      </View>

      {/*
        A campo vuoto i numeri vanno a zero, non via: il blocco che sparisce
        fa saltare l'altezza della finestra mentre si cancella per riscrivere,
        e i bottoni si spostano sotto il dito.
      */}
      {food ? (
        <View style={styles.scaled}>
          <Text style={[styles.scaledKcal, { color: colors.text }]}>
            {Math.round((food.kcal * quantity) / 100)} kcal
          </Text>
          <MacroTriple
            protein={(food.protein * quantity) / 100}
            carbs={(food.carbs * quantity) / 100}
            fat={(food.fat * quantity) / 100}
          />
        </View>
      ) : null}
    </DfAlert>
  );
};

const styles = StyleSheet.create({
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  headText: { flex: 1 },
  brand: { fontSize: 13 },
  reference: { fontSize: 12 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  input: {
    flex: 1,
    fontSize: 16,
    borderWidth: 1,
    borderRadius: theme.radius.lg,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: 14,
  },
  unit: {
    fontSize: 16,
    fontWeight: "600",
    minWidth: 64,
  },
  scaled: {
    marginTop: theme.spacing.md,
    alignItems: "center",
    gap: theme.spacing.xs,
  },
  scaledKcal: { fontSize: 20, fontWeight: "700" },
});
