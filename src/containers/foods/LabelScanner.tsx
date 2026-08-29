import { hasGroqKey } from "@/src/ai/config";
import {
  labelUpdates,
  readNutritionLabel,
  type LabelReading,
} from "@/src/ai/readNutritionLabel";
import { DfButton } from "@/src/components/form/DfButton";
import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import { useTranslation } from "@/src/hooks/useTranslation";
import { theme } from "@/src/styles";
import { logger } from "@/src/utils/logger";
import { showToast } from "@/src/utils/toast";
import type { Nutrients } from "@/src/domain/nutrition";
import * as ImagePicker from "expo-image-picker";
import { ScanLine } from "lucide-react-native";
import React, { useState } from "react";
import { StyleSheet, View } from "react-native";
import { useFormContext } from "react-hook-form";

/**
 * Il pulsante che legge la tabella nutrizionale da una foto della confezione.
 *
 * Riempie i campi del form e si ferma lì: il salvataggio resta un gesto
 * dell'utente, che ha la scatola in mano e può correggere quel che la foto ha
 * reso male. È la ragione per cui questa è l'unica parte dell'app in cui i
 * valori nutrizionali arrivano dal modello (vedi readNutritionLabel.ts).
 *
 * Un campo non letto NON viene toccato: sovrascriverlo con zero cancellerebbe
 * un valore che l'utente aveva già digitato a mano.
 */

/** Nomi dei campi nel form alimenti; l'etichetta usa gli stessi nutrienti. */
const FIELD_OF: Record<keyof Nutrients, string> = {
  kcal: "kcal",
  protein: "protein",
  carbs: "carbs",
  sugars: "sugars",
  fat: "fat",
  saturatedFat: "saturatedFat",
  fiber: "fiber",
  salt: "salt",
};

export const LabelScanner: React.FC = () => {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const form = useFormContext();
  const [busy, setBusy] = useState(false);

  const apply = (reading: LabelReading) => {
    const updates = labelUpdates(reading, {
      name: String(form.getValues("name") ?? ""),
      defaultServingG: form.getValues("defaultServingG") ?? null,
    });

    let filled = 0;
    for (const key of Object.keys(FIELD_OF) as (keyof Nutrients)[]) {
      const value = updates.nutrients[key];
      if (value === undefined) continue;
      form.setValue(FIELD_OF[key], value, { shouldDirty: true });
      filled++;
    }
    if (updates.name !== null) {
      form.setValue("name", updates.name, { shouldDirty: true });
    }
    if (updates.defaultServingG !== null) {
      form.setValue("defaultServingG", updates.defaultServingG, {
        shouldDirty: true,
      });
    }

    if (filled === 0) {
      showToast.error({ title: t("label_scan.nothing_read") });
      return;
    }
    showToast.success({
      title: t("label_scan.filled", { count: filled }),
      // Dire cosa manca è metà del lavoro: senza, l'utente salverebbe
      // credendo che i campi rimasti a zero siano stati letti davvero.
      message:
        updates.missing.length > 0
          ? t("label_scan.check_missing", { count: updates.missing.length })
          : undefined,
    });
  };

  const scan = async (uri: string) => {
    setBusy(true);
    try {
      apply(await readNutritionLabel(uri));
    } catch (error) {
      logger.error("[etichetta] lettura fallita", error);
      showToast.error({ title: t("label_scan.failed") });
    } finally {
      setBusy(false);
    }
  };

  const fromCamera = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    if (!result.canceled && result.assets[0]) await scan(result.assets[0].uri);
  };

  const fromLibrary = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) await scan(result.assets[0].uri);
  };

  if (!hasGroqKey()) {
    return (
      <Text style={[styles.disabled, { color: colors.textMuted }]}>
        {t("label_scan.no_key")}
      </Text>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.buttons}>
        <DfButton
          label={t("label_scan.camera")}
          variant="outlined"
          fullWidth={false}
          loading={busy}
          onPress={fromCamera}
          icon={<ScanLine size={18} color={colors.text} />}
          style={styles.button}
        />
        <DfButton
          label={t("label_scan.gallery")}
          variant="outlined"
          fullWidth={false}
          loading={busy}
          onPress={fromLibrary}
          style={styles.button}
        />
      </View>
      <Text style={[styles.hint, { color: colors.textMuted }]}>
        {t("label_scan.hint")}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { gap: theme.spacing.xs, marginBottom: theme.spacing.sm },
  buttons: {
    flexDirection: "row",
    gap: theme.spacing.sm,
  },
  button: { flexGrow: 1, flexBasis: 0 },
  hint: { fontSize: 12, lineHeight: 16 },
  disabled: { fontSize: 12, lineHeight: 16, marginBottom: theme.spacing.sm },
});
