import { DfAlert } from "@/src/components/DfAlert";
import { DfButton } from "@/src/components/form/DfButton";
import { Card, ScreenBackground } from "@/src/components/kal";
import { useAppTheme } from "@/src/components/ThemeContext";
import { Text, TextInput } from "@/src/components/ui";
import {
  createMealType,
  deleteMealType,
  listAllMealTypes,
  renameMealType,
  setMealTypeHidden,
} from "@/src/db/queries/diary";
import { useAppNav } from "@/src/hooks/useAppNav";
import { useFocusData } from "@/src/hooks/useFocusData";
import { useTranslation } from "@/src/hooks/useTranslation";
import { theme } from "@/src/styles";
import type { MealTypeRow } from "@/src/types/nutrition";
import { logger } from "@/src/utils/logger";
import { showToast } from "@/src/utils/toast";
import { Check, ChevronLeft, Pencil, Trash2 } from "lucide-react-native";
import React, { useCallback, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Switch,
  TouchableOpacity,
  View,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

/**
 * Quali pasti si possono usare.
 *
 * Spegnere un pasto NON e' cancellarlo: i pasti gia' registrati restano nel
 * diario e nei totali dei giorni passati, e quello spento sparisce solo da
 * dove si sceglie - foglio Aggiungi, piano pasti, assistente. Chi non fa mai
 * il brunch lo spegne e non lo vede piu'.
 *
 * I cinque predefiniti si spengono ma non si cancellano: i loro id sono
 * referenziati dal seed, dai test e dai tool dell'assistente. Quelli aggiunti
 * qui si rinominano e si eliminano.
 */
export function MealTypesScreen() {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const { goBack } = useAppNav();
  const insets = useSafeAreaInsets();

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
    <View style={styles.root}>
      <ScreenBackground />
      <SafeAreaView edges={["top", "left", "right"]} style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity onPress={goBack} activeOpacity={0.6} hitSlop={10}>
            <ChevronLeft size={26} color={colors.textSecondary} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
            {t("meal_types.title")}
          </Text>
        </View>

        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + theme.spacing.lg },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={[styles.hint, { color: colors.textMuted }]}>
            {t("meal_types.hint")}
          </Text>

          <Card style={styles.card}>
            {types.map((type) => {
              const attivo = type.hidden === 0;
              /* L'ultimo acceso resta acceso: senza un pasto attivo il foglio
                 Aggiungi non ha una destinazione. */
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

                  {type.is_custom === 1 ? (
                    <>
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
                      <TouchableOpacity
                        onPress={() => setPendingDelete(type)}
                        activeOpacity={0.6}
                        hitSlop={8}
                        accessibilityLabel={t("delete")}
                      >
                        <Trash2 size={18} color={theme.colors.error} />
                      </TouchableOpacity>
                    </>
                  ) : null}

                  <Switch
                    value={attivo}
                    disabled={bloccato}
                    onValueChange={(next) => void toggle(type, next)}
                  />
                </View>
              );
            })}
          </Card>

          <Card style={styles.card}>
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
            <DfButton
              label={t("meal_types.add")}
              variant="outlined"
              disabled={draft.trim().length === 0}
              onPress={() => void aggiungi()}
            />
          </Card>
        </ScrollView>
      </SafeAreaView>

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
  content: {
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
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
