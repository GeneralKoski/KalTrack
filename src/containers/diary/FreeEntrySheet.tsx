import { DfAlert } from "@/src/components/DfAlert";
import { useAppTheme } from "@/src/components/ThemeContext";
import { DraftTextInput, Text } from "@/src/components/ui";
import { EMPTY_NUTRIENTS, type Nutrients } from "@/src/domain/nutrition";
import { useTranslation } from "@/src/hooks/useTranslation";
import { theme } from "@/src/styles";
import { decimalSeparator } from "@/src/utils/number";
import { sanitizeDecimalInput } from "@/src/utils/utils";
import type { MealEntryRow } from "@/src/types/nutrition";
import React, { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

interface FreeEntrySheetProps {
  isOpen: boolean;
  /**
   * Presente quando il foglio serve a CORREGGERE una voce libera gia' scritta
   * (non ad aggiungerne una nuova). I grammi non entrano: una voce libera li
   * congela a 1 fin dalla creazione, quindi modificare vuol dire riscrivere
   * nome e valori assoluti, non quanto - vedi `updateFreeEntry`.
   */
  editing?: MealEntryRow | null;
  onConfirm: (label: string, nutrients: Nutrients) => void;
  onClose: () => void;
}

const toNumber = (text: string): number => {
  const parsed = Number(text.replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
};

/** `850` -> "850", coi decimali nella forma che si scrive in questa lingua. */
const toDisplayValue = (value: number): string =>
  String(value).replace(".", decimalSeparator());

/**
 * Voce libera: un piatto di cui si sanno solo i valori approssimativi, tipico
 * del mangiare fuori. Non è una stima di un modello - i numeri li scrive
 * l'utente - quindi non porta la stellina AI.
 */
export const FreeEntrySheet: React.FC<FreeEntrySheetProps> = ({
  isOpen,
  editing = null,
  onConfirm,
  onClose,
}) => {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const [label, setLabel] = useState("");
  const [kcal, setKcal] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");

  // Un foglio che si riempie da una prop torna a quella prop, non al vuoto
  // (CLAUDE.md "Un foglio o una finestra che si chiude si svuota"): in
  // modifica riempie dalla voce che si sta correggendo, altrimenti svuota. La
  // dipendenza su `isOpen` e' quel che fa ripartire il riempimento a ogni
  // riapertura, anche sulla stessa voce.
  useEffect(() => {
    if (!isOpen) return;
    if (editing) {
      setLabel(editing.label ?? "");
      setKcal(toDisplayValue(editing.kcal));
      setProtein(toDisplayValue(editing.protein));
      setCarbs(toDisplayValue(editing.carbs));
      setFat(toDisplayValue(editing.fat));
    } else {
      setLabel("");
      setKcal("");
      setProtein("");
      setCarbs("");
      setFat("");
    }
  }, [isOpen, editing]);

  const valid = label.trim().length > 0 && toNumber(kcal) > 0;

  const confirm = () => {
    if (!valid) return;
    onConfirm(label.trim(), {
      ...EMPTY_NUTRIENTS,
      kcal: toNumber(kcal),
      protein: toNumber(protein),
      carbs: toNumber(carbs),
      fat: toNumber(fat),
    });
  };

  /**
   * Il nome del macro sta SOPRA il campo, non nel placeholder: in tre colonne
   * "Carboidrati" non ci sta, e un placeholder non si può accorciare con i tre
   * puntini - viene tagliato a metà parola ("Carboid"). L'etichetta invece sì.
   */
  const field = (
    value: string,
    onChangeText: (v: string) => void,
    label: string,
  ) => (
    <View style={styles.macroField}>
      <Text
        style={[styles.macroLabel, { color: colors.textMuted }]}
        numberOfLines={1}
      >
        {label}
      </Text>
      <DraftTextInput
        value={value}
        onChangeText={onChangeText}
        sanitize={sanitizeDecimalInput}
        placeholder={t("diary.free_macro_placeholder")}
        placeholderTextColor={colors.textFaint}
        keyboardType="decimal-pad"
        style={[
          styles.input,
          styles.macroInput,
          { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text },
        ]}
      />
    </View>
  );

  return (
    <DfAlert
      isOpen={isOpen}
      title={t("diary.free_entry")}
      confirmLabel={t("confirm")}
      onConfirm={confirm}
      onClose={onClose}
    >
      <View style={styles.body}>
        <DraftTextInput
          value={label}
          onChangeText={setLabel}
          placeholder={t("diary.free_label_placeholder")}
          placeholderTextColor={colors.textFaint}
          autoFocus
          style={[
            styles.input,
            { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text },
          ]}
        />

        <DraftTextInput
          value={kcal}
          onChangeText={setKcal}
          sanitize={sanitizeDecimalInput}
          placeholder={t("diary.free_kcal_placeholder")}
          placeholderTextColor={colors.textFaint}
          keyboardType="decimal-pad"
          style={[
            styles.input,
            { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text },
          ]}
        />

        <Text style={[styles.optional, { color: colors.textMuted }]}>
          {t("diary.free_macros_optional")}
        </Text>

        <View style={styles.macros}>
          {field(protein, setProtein, t("diary.protein_short"))}
          {field(carbs, setCarbs, t("diary.carbs_short"))}
          {field(fat, setFat, t("diary.fat_short"))}
        </View>
      </View>
    </DfAlert>
  );
};

const styles = StyleSheet.create({
  body: {
    gap: theme.spacing.sm,
  },
  input: {
    borderWidth: 1,
    borderRadius: theme.radius.lg,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    fontSize: 15,
  },
  optional: {
    fontSize: 12,
    marginTop: theme.spacing.xs,
  },
  macros: {
    flexDirection: "row",
    gap: theme.spacing.sm,
  },
  macroField: {
    flex: 1,
    gap: 2,
  },
  macroLabel: {
    fontSize: 11,
    fontWeight: "500",
    textAlign: "center",
  },
  macroInput: {
    textAlign: "center",
  },
});
