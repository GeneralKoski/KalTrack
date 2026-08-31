import type { PhotoEstimate } from "@/src/ai/estimateFromPhoto";
import { DfAlert } from "@/src/components/DfAlert";
import { useAppTheme } from "@/src/components/ThemeContext";
import { Text, TextInput } from "@/src/components/ui";
import {
  includedTotals,
  rowNutrients,
  rowsFromEstimate,
  savableRows,
  type EstimateRow,
} from "@/src/domain/photoEstimate";
import { toGrams } from "@/src/domain/serving";
import { useTranslation } from "@/src/hooks/useTranslation";
import { theme } from "@/src/styles";
import { Check, Square } from "lucide-react-native";
import React, { useEffect, useState } from "react";
import { ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";

interface PhotoEstimateSheetProps {
  isOpen: boolean;
  estimate: PhotoEstimate | null;
  /** La stima e' in corso: si apre subito, cosi' il tocco ha una risposta. */
  loading?: boolean;
  onConfirm: (rows: EstimateRow[]) => void;
  onClose: () => void;
}

const int = (value: number): string => String(Math.round(value));

/**
 * Revisione della stima da foto, prima che diventi diario.
 *
 * La foto torna un piatto per voce, e ognuna e' un numero inventato guardando
 * un'immagine: qui si correggono i grammi e si esclude quel che non si e'
 * mangiato. Confermando diventano N voci separate, non una somma - se la
 * cotoletta e' stimata male si corregge la cotoletta.
 */
export const PhotoEstimateSheet: React.FC<PhotoEstimateSheetProps> = ({
  isOpen,
  estimate,
  loading = false,
  onConfirm,
  onClose,
}) => {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const [rows, setRows] = useState<EstimateRow[]>([]);
  const [gramsText, setGramsText] = useState<Record<string, string>>({});

  /**
   * I grammi si tengono come TESTO mentre si digita: con un numero, cancellare
   * l'ultima cifra darebbe 0 e il campo si riscriverebbe da solo sotto le dita.
   */
  useEffect(() => {
    if (!isOpen || loading || !estimate) {
      setRows([]);
      setGramsText({});
      return;
    }
    const iniziali = rowsFromEstimate(estimate.items);
    setRows(iniziali);
    setGramsText(
      Object.fromEntries(iniziali.map((row) => [row.key, int(row.grams)])),
    );
  }, [isOpen, estimate, loading]);

  const patch = (key: string, change: Partial<EstimateRow>) =>
    setRows((current) =>
      current.map((row) => (row.key === key ? { ...row, ...change } : row)),
    );

  const salvabili = savableRows(rows);
  const totali = includedTotals(rows);

  return (
    <DfAlert
      isOpen={isOpen}
      title={t("photo_entry.review_title")}
      confirmLabel={t("photo_entry.confirm", { count: salvabili.length })}
      onConfirm={() => salvabili.length > 0 && onConfirm(salvabili)}
      onClose={onClose}
      loading={loading}
      verticalFooter
      size="lg"
    >
      <View style={styles.body}>
        <Text style={[styles.caveat, { color: colors.textMuted }]}>
          {loading ? t("photo_entry.working") : (estimate?.caveat ?? "")}
        </Text>

        <ScrollView
          style={styles.list}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {rows.map((row) => (
            <View
              key={row.key}
              style={[styles.row, { borderColor: colors.border }]}
            >
              <TouchableOpacity
                onPress={() => patch(row.key, { included: !row.included })}
                activeOpacity={0.6}
                hitSlop={8}
              >
                {row.included ? (
                  <Check size={20} color={colors.accent} />
                ) : (
                  <Square size={20} color={colors.textFaint} />
                )}
              </TouchableOpacity>

              <View style={styles.rowMain}>
                <TextInput
                  value={row.label}
                  onChangeText={(label) => patch(row.key, { label })}
                  placeholder={t("photo_entry.label_placeholder")}
                  placeholderTextColor={colors.textFaint}
                  style={[styles.label, { color: colors.text }]}
                />
                <Text style={[styles.detail, { color: colors.textFaint }]}>
                  {t("photo_entry.row_detail", {
                    kcal: int(rowNutrients(row).kcal),
                    source: row.fromCatalog
                      ? t("photo_entry.from_catalog")
                      : t("photo_entry.from_photo"),
                  })}
                </Text>
              </View>

              <View style={styles.gramsBox}>
                <TextInput
                  value={gramsText[row.key] ?? ""}
                  onChangeText={(text) => {
                    setGramsText((current) => ({
                      ...current,
                      [row.key]: text,
                    }));
                    patch(row.key, { grams: toGrams(text) });
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
              </View>
            </View>
          ))}
        </ScrollView>

        <Text style={[styles.total, { color: colors.text }]}>
          {t("photo_entry.total", {
            kcal: int(totali.kcal),
            protein: int(totali.protein),
            carbs: int(totali.carbs),
            fat: int(totali.fat),
          })}
        </Text>
      </View>
    </DfAlert>
  );
};

const styles = StyleSheet.create({
  body: { gap: theme.spacing.sm },
  caveat: { fontSize: 12, lineHeight: 17 },
  // Un tetto e non `flex: 1`: dentro DfAlert una lista senza altezza propria
  // cresce fino a spingere fuori il piede col bottone Conferma.
  list: { maxHeight: 320 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowMain: { flex: 1, gap: 2 },
  label: { fontSize: 15, fontWeight: "600", padding: 0 },
  detail: { fontSize: 11 },
  gramsBox: { alignItems: "center", gap: 2 },
  grams: {
    borderWidth: 1,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 6,
    fontSize: 15,
    minWidth: 64,
    textAlign: "right",
  },
  unit: { fontSize: 10 },
  total: { fontSize: 14, fontWeight: "700" },
});
