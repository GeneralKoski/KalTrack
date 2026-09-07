import { hasAiKey } from "@/src/ai/config";
import {
  labelUpdates,
  readNutritionLabel,
  type LabelReading,
} from "@/src/ai/readNutritionLabel";
import { DfButton } from "@/src/components/form/DfButton";
import { AiKeyPrompt } from "@/src/containers/settings/AiKeyPrompt";
import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import { useTranslation } from "@/src/hooks/useTranslation";
import { theme } from "@/src/styles";
import { logger } from "@/src/utils/logger";
import { showToast } from "@/src/utils/toast";
import type { Nutrients } from "@/src/domain/nutrition";
import * as ImagePicker from "expo-image-picker";
import { Image as ImageIcon, ScanLine } from "lucide-react-native";
import React, { useState } from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
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

/** Chiavi i18n dei campi, per dire all'utente quali non sono stati letti. */
const FIELD_LABEL: Record<keyof Nutrients, string> = {
  kcal: "kcal",
  protein: "protein",
  carbs: "carbs",
  sugars: "sugars",
  fat: "fat",
  saturatedFat: "saturated_fat",
  fiber: "fiber",
  salt: "salt",
};

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
  const [askKey, setAskKey] = useState(false);

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
      // I campi mancanti si NOMINANO, non si contano: restano a zero come
      // qualunque campo vuoto, e "3 campi non letti" non dice all'utente
      // quali numeri sta per salvare senza averli mai visti sull'etichetta.
      message:
        updates.missing.length > 0
          ? t("label_scan.check_missing", {
              fields: updates.missing
                .map((key) => t(`foods.${FIELD_LABEL[key]}`))
                .join(", "),
            })
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

  /*
   * Senza chiave i pulsanti restano al loro posto e chiedono la chiave al
   * tocco. Prima sparivano dietro una riga di testo spenta, che diceva cosa
   * mancava e non dove metterlo.
   */
  const guard = (action: () => Promise<void>) => () => {
    if (!hasAiKey()) {
      setAskKey(true);
      return;
    }
    void action();
  };

  return (
    <View style={styles.root}>
      {/*
        Una sola azione, e la galleria sotto come collegamento.
        Erano due bottoni affiancati e uguali di peso, il secondo dei quali si
        chiamava "Da galleria": lo stesso nome del comando che duecento pixel
        piu' su sceglieva la foto del PRODOTTO. Due comandi omonimi nella
        stessa schermata per due cose diverse, e il primo si troncava a
        "Scansiona etich...". Inquadrare la scatola e' l'azione; pescare da
        galleria e' la via di riserva, e si scrive come tale.
      */}
      <DfButton
        label={t("label_scan.camera")}
        variant="outlined"
        loading={busy}
        onPress={guard(fromCamera)}
        icon={<ScanLine size={18} color={colors.text} />}
      />
      <TouchableOpacity
        onPress={guard(fromLibrary)}
        activeOpacity={0.6}
        disabled={busy}
        accessibilityRole="button"
        style={styles.link}
      >
        <ImageIcon size={14} color={colors.textMuted} />
        <Text style={[styles.linkLabel, { color: colors.textMuted }]}>
          {t("label_scan.gallery")}
        </Text>
      </TouchableOpacity>

      <Text style={[styles.hint, { color: colors.textMuted }]}>
        {t("label_scan.hint")}
      </Text>

      <AiKeyPrompt isOpen={askKey} onClose={() => setAskKey(false)} />
    </View>
  );
};

const styles = StyleSheet.create({
  root: { gap: theme.spacing.xs, marginBottom: theme.spacing.sm },
  link: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: theme.spacing.sm,
  },
  linkLabel: { fontSize: 12, fontWeight: "500" },
  hint: { fontSize: 12, lineHeight: 16 },
});
