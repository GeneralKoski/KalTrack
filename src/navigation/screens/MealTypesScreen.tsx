import { DfAlert } from "@/src/components/DfAlert";
import { SettingsPage } from "@/src/containers/settings/SettingsPage";
import { Card } from "@/src/components/kal";
import { useAppTheme } from "@/src/components/ThemeContext";
import { Text, TextInput } from "@/src/components/ui";
import {
  createMealType,
  deleteMealType,
  listAllMealTypes,
  renameMealType,
  setMealTypeHidden,
} from "@/src/db/queries/diary";
import { useFocusData } from "@/src/hooks/useFocusData";
import { useTranslation } from "@/src/hooks/useTranslation";
import { theme } from "@/src/styles";
import type { MealTypeRow } from "@/src/types/nutrition";
import { logger } from "@/src/utils/logger";
import { showToast } from "@/src/utils/toast";
import { Check, Pencil, Plus, Trash2 } from "lucide-react-native";
import React, { useCallback, useState } from "react";
import { StyleSheet, Switch, TouchableOpacity, View } from "react-native";

/**
 * Quali pasti si possono usare.
 *
 * Spegnere un pasto NON e' cancellarlo: i pasti gia' registrati restano nel
 * diario e nei totali dei giorni passati, e quello spento sparisce solo da
 * dove si sceglie - foglio Aggiungi, piano pasti, assistente. Chi non fa mai
 * il brunch lo spegne e non lo vede piu'.
 *
 * Si rinominano e si cancellano tutti, predefiniti compresi: l'unico vincolo
 * e' che ne resti uno attivo, o il foglio Aggiungi non avrebbe una
 * destinazione. Le righe gia' registrate restano nel diario in ogni caso.
 */
export function MealTypesScreen() {
  const { t } = useTranslation();
  const { colors } = useAppTheme();

  const loader = useCallback(() => listAllMealTypes(), []);
  const { data, reload } = useFocusData<MealTypeRow[]>(loader);
  const types = data ?? [];

  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [pendingDelete, setPendingDelete] = useState<MealTypeRow | null>(null);

  const visibili = types.filter((type) => type.hidden === 0).length;

  const toggle = async (type: MealTypeRow, next: boolean) => {
    try {
      await setMealTypeHidden(type.id, !next);
      reload();
    } catch (error) {
      logger.warn("[diario] pasto non aggiornato", error);
      showToast.error({ title: t("meal_types.last_one") });
    }
  };

  const aggiungi = async () => {
    const name = draft.trim();
    if (name.length === 0) return;
    try {
      await createMealType(name);
      setDraft("");
      reload();
    } catch (error) {
      logger.warn("[diario] pasto non creato", error);
      showToast.error({ title: t("general_error") });
    }
  };

  const rinomina = async () => {
    const name = editingName.trim();
    if (editingId === null || name.length === 0) {
      setEditingId(null);
      return;
    }
    try {
      await renameMealType(editingId, name);
      setEditingId(null);
      reload();
    } catch (error) {
      logger.warn("[diario] pasto non rinominato", error);
      showToast.error({ title: t("general_error") });
    }
  };

  const elimina = async () => {
    if (!pendingDelete) return;
    try {
      await deleteMealType(pendingDelete.id);
      setPendingDelete(null);
      reload();
    } catch (error) {
      logger.warn("[diario] pasto non eliminato", error);
      setPendingDelete(null);
      showToast.error({ title: t("general_error") });
    }
  };

  return (
    <SettingsPage title={t("meal_types.title")}>
      <Text style={[styles.hint, { color: colors.textMuted }]}>
        {t("meal_types.hint")}
      </Text>

      <Card style={styles.card}>
        {types.map((type) => {
          const attivo = type.hidden === 0;
          /* L'ultimo attivo non si spegne e non si cancella: senza, il
             foglio Aggiungi non ha una destinazione. */
          const bloccato = attivo && visibili === 1;

          if (editingId === type.id) {
            return (
              <View key={type.id} style={styles.row}>
                <TextInput
                  value={editingName}
                  onChangeText={setEditingName}
                  autoFocus
                  style={[
                    styles.input,
                    { color: colors.text, borderColor: colors.border },
                  ]}
                  onSubmitEditing={() => void rinomina()}
                />
                <TouchableOpacity
                  onPress={() => void rinomina()}
                  activeOpacity={0.6}
                  hitSlop={8}
                >
                  <Check size={20} color={colors.accent} />
                </TouchableOpacity>
              </View>
            );
          }

          return (
            <View key={type.id} style={styles.row}>
              <Text
                style={[styles.name, { color: colors.text }]}
                numberOfLines={1}
              >
                {type.name}
              </Text>

              <TouchableOpacity
                onPress={() => {
                  setEditingId(type.id);
                  setEditingName(type.name);
                }}
                activeOpacity={0.6}
                hitSlop={8}
                accessibilityLabel={t("meal_types.rename")}
              >
                <Pencil size={18} color={colors.textFaint} />
              </TouchableOpacity>
              {/* Anche i predefiniti: l'unico vincolo e' che ne resti uno
                      attivo, e chi non fa il brunch non deve tenerselo. */}
              <TouchableOpacity
                onPress={() => setPendingDelete(type)}
                activeOpacity={0.6}
                hitSlop={8}
                disabled={bloccato}
                accessibilityLabel={t("delete")}
              >
                <Trash2
                  size={18}
                  color={bloccato ? colors.textFaint : theme.colors.error}
                />
              </TouchableOpacity>

              <Switch
                value={attivo}
                disabled={bloccato}
                onValueChange={(next) => void toggle(type, next)}
              />
            </View>
          );
        })}
      </Card>

      <View style={styles.row}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder={t("meal_types.new_placeholder")}
          placeholderTextColor={colors.textFaint}
          style={[
            styles.input,
            { color: colors.text, borderColor: colors.border },
          ]}
          onSubmitEditing={() => void aggiungi()}
        />
        <TouchableOpacity
          onPress={() => void aggiungi()}
          activeOpacity={0.6}
          hitSlop={8}
          disabled={draft.trim().length === 0}
          accessibilityLabel={t("meal_types.add")}
        >
          <Plus
            size={22}
            color={draft.trim().length === 0 ? colors.textFaint : colors.accent}
          />
        </TouchableOpacity>
      </View>
      <DfAlert
        isOpen={pendingDelete !== null}
        title={t("meal_types.delete_title")}
        message={t("meal_types.delete_message", {
          name: pendingDelete?.name ?? "",
        })}
        confirmLabel={t("delete")}
        onConfirm={() => void elimina()}
        onClose={() => setPendingDelete(null)}
      />
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  hint: { fontSize: 13, lineHeight: 18 },
  card: { gap: theme.spacing.sm },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
  },
  name: { flex: 1, fontSize: 15, fontWeight: "500" },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    fontSize: 15,
  },
});
