import { DfAlert } from "@/src/components/DfAlert";
import { DfImage } from "@/src/components/DfImage";
import { DfButton } from "@/src/components/form/DfButton";
import { ScreenBackground, SectionLabel } from "@/src/components/kal";
import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import { ExerciseFormSheet } from "@/src/containers/gym/ExerciseFormSheet";
import {
  deleteExercise,
  getExercise,
  setExerciseBanned,
  setExerciseDislike,
} from "@/src/db/queries/exercises";
import { useAppNav } from "@/src/hooks/useAppNav";
import { useFocusData } from "@/src/hooks/useFocusData";
import { useTranslation } from "@/src/hooks/useTranslation";
import { unpublishExercise } from "@/src/services/exerciseCatalog";
import { theme } from "@/src/styles";
import { exerciseEquipment, exerciseSecondary } from "@/src/types/gym";
import { showToast } from "@/src/utils/toast";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import { useRoute, type RouteProp } from "@react-navigation/native";
import { Check, ChevronLeft, Dumbbell, Trash2 } from "lucide-react-native";
import React, { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

/** Le tre preferenze sono mutuamente esclusive, anche se in tabella sono due
 * colonne indipendenti (`is_banned`, `dislike_level`): un esercizio vietato
 * non ha senso che sia anche "sgradito", e mostrarli come stati separati
 * confondeva più di quanto informasse. */
type Preference = "ok" | "dislike" | "ban";

export function ExerciseDetailScreen() {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const { goBack } = useAppNav();
  const insets = useSafeAreaInsets();
  const route =
    useRoute<RouteProp<{ params: { id: string } }, "params">>();
  const id = route.params.id;

  const formRef = useRef<BottomSheetModal>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const loader = useCallback(() => getExercise(id), [id]);
  const { data: exercise, loading, reload } = useFocusData(loader);

  const preference: Preference = !exercise
    ? "ok"
    : exercise.is_banned === 1
      ? "ban"
      : exercise.dislike_level > 0
        ? "dislike"
        : "ok";

  const setPreference = async (value: Preference) => {
    if (!exercise) return;
    await Promise.all([
      setExerciseBanned(exercise.id, value === "ban"),
      setExerciseDislike(exercise.id, value === "dislike" ? 2 : 0),
    ]);
    reload();
  };

  const onDelete = async () => {
    if (!exercise) return;
    await deleteExercise(exercise.id);
    // Toglie anche dal catalogo comune, ma solo se la voce e' propria: il
    // servizio non prova nemmeno a toccare quella di un altro.
    void unpublishExercise(exercise.name);
    setConfirmDelete(false);
    showToast.success({ title: t("gym.exercise_deleted") });
    goBack();
  };

  const equipment = exercise ? exerciseEquipment(exercise) : [];
  const secondary = exercise ? exerciseSecondary(exercise) : [];

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
            {exercise?.name ?? ""}
          </Text>
        </View>

        {loading && !exercise ? (
          <ActivityIndicator style={styles.loader} color={colors.accent} />
        ) : !exercise ? (
          <Text style={[styles.notFound, { color: colors.textMuted }]}>
            {t("gym.exercise_not_found")}
          </Text>
        ) : (
          <ScrollView
            contentContainerStyle={[
              styles.content,
              { paddingBottom: insets.bottom + theme.spacing.lg },
            ]}
            showsVerticalScrollIndicator={false}
          >
            {exercise.photo_uri ? (
              <DfImage
                source={exercise.photo_uri}
                containerStyle={styles.photo}
              />
            ) : (
              <View
                style={[
                  styles.photo,
                  styles.photoPlaceholder,
                  { backgroundColor: colors.surfaceMuted },
                ]}
              >
                <Dumbbell size={40} color={colors.textFaint} />
              </View>
            )}

            <Text style={[styles.meta, { color: colors.textMuted }]}>
              {t(`gym.muscle.${exercise.muscle_group}`)}
              {secondary.length > 0
                ? ` · ${secondary.map((m) => t(`gym.muscle.${m}`)).join(", ")}`
                : ""}
            </Text>
            {equipment.length > 0 ? (
              <Text
                style={[styles.meta, styles.equipment, { color: colors.textMuted }]}
              >
                {equipment.map((e) => t(`gym.equipment.${e}`)).join(", ")}
              </Text>
            ) : null}

            <SectionLabel style={styles.sectionLabel}>
              {t("gym.description_label")}
            </SectionLabel>
            <Text style={[styles.description, { color: colors.text }]}>
              {exercise.instructions || t("gym.no_description")}
            </Text>

            <SectionLabel style={styles.sectionLabel}>
              {t("gym.preference_title")}
            </SectionLabel>
            <View style={styles.preferenceGroup}>
              <PreferenceRow
                label={t("gym.preference_ok")}
                active={preference === "ok"}
                onPress={() => void setPreference("ok")}
              />
              <PreferenceRow
                label={t("gym.preference_dislike")}
                hint={t("gym.preference_dislike_hint")}
                active={preference === "dislike"}
                onPress={() => void setPreference("dislike")}
              />
              <PreferenceRow
                label={t("gym.preference_ban")}
                hint={t("gym.preference_ban_hint")}
                active={preference === "ban"}
                onPress={() => void setPreference("ban")}
              />
            </View>

            {/* Correggere ed eliminare solo le voci create qui: quelle del
                catalogo di partenza sono di tutti, e una modifica locale le
                farebbe divergere dallo stesso esercizio sugli altri telefoni. */}
            {exercise.is_custom === 1 ? (
              <View style={styles.ownerActions}>
                <DfButton
                  label={t("gym.edit_exercise")}
                  variant="outlined"
                  onPress={() => formRef.current?.present()}
                  style={styles.ownerButton}
                />
                <DfButton
                  label={t("gym.delete_exercise")}
                  variant="outlined"
                  color={theme.colors.error}
                  icon={<Trash2 size={18} color={theme.colors.error} />}
                  onPress={() => setConfirmDelete(true)}
                  style={styles.ownerButton}
                />
              </View>
            ) : null}
          </ScrollView>
        )}
      </SafeAreaView>

      <ExerciseFormSheet
        ref={formRef}
        editing={exercise}
        onSaved={() => {
          reload();
          formRef.current?.dismiss();
        }}
      />

      <DfAlert
        isOpen={confirmDelete}
        title={exercise?.name}
        message={t("gym.delete_exercise_message")}
        confirmLabel={t("delete")}
        cancelLabel={t("cancel")}
        onConfirm={() => void onDelete()}
        onClose={() => setConfirmDelete(false)}
      />
    </View>
  );
}

const PreferenceRow: React.FC<{
  label: string;
  hint?: string;
  active: boolean;
  onPress: () => void;
}> = ({ label, hint, active, onPress }) => {
  const { colors } = useAppTheme();

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.6}
      style={[
        styles.preferenceRow,
        {
          borderColor: active ? colors.accent : colors.border,
          backgroundColor: active ? colors.surfaceMuted : "transparent",
        },
      ]}
    >
      <View style={styles.preferenceBody}>
        <Text
          style={[
            styles.preferenceLabel,
            { color: active ? colors.accent : colors.text },
          ]}
        >
          {label}
        </Text>
        {hint ? (
          <Text style={[styles.preferenceHint, { color: colors.textMuted }]}>
            {hint}
          </Text>
        ) : null}
      </View>
      {active ? <Check size={18} color={colors.accent} /> : null}
    </TouchableOpacity>
  );
};

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
  loader: { marginTop: theme.spacing.xl },
  notFound: { textAlign: "center", marginTop: theme.spacing.xl, fontSize: 14 },
  content: { paddingHorizontal: theme.spacing.md },
  photo: {
    width: "100%",
    height: 200,
    borderRadius: theme.radius.xl,
  },
  photoPlaceholder: { alignItems: "center", justifyContent: "center" },
  meta: {
    fontSize: 14,
    fontWeight: "500",
    marginTop: theme.spacing.md,
    textTransform: "capitalize",
  },
  equipment: { marginTop: 2 },
  sectionLabel: { marginTop: theme.spacing.lg, marginBottom: theme.spacing.xs },
  description: { fontSize: 14, lineHeight: 20 },
  preferenceGroup: { gap: theme.spacing.sm },
  preferenceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    borderWidth: 1,
    borderRadius: theme.radius.lg,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  preferenceBody: { flex: 1 },
  preferenceLabel: { fontSize: 15, fontWeight: "600" },
  preferenceHint: { fontSize: 12, marginTop: 2, lineHeight: 16 },
  ownerActions: {
    flexDirection: "row",
    gap: theme.spacing.sm,
    marginTop: theme.spacing.lg,
  },
  ownerButton: { flex: 1 },
});
