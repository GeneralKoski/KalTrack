import { hasBackend } from "@/src/api/config";
import { DfBottomSheet } from "@/src/components/DfBottomSheet";
import { DfButton } from "@/src/components/form/DfButton";
import { Chip } from "@/src/components/kal";
import { useAppTheme } from "@/src/components/ThemeContext";
import { Text, TextInput } from "@/src/components/ui";
import {
  createExercise,
  findExerciseByName,
  updateExercise,
} from "@/src/db/queries/exercises";
import {
  publishToCatalog,
  updatePublishedExercise,
} from "@/src/services/exerciseCatalog";
import { useAccountStore } from "@/src/stores/accountStore";
import { useTranslation } from "@/src/hooks/useTranslation";
import { theme } from "@/src/styles";
import {
  EQUIPMENT,
  MUSCLE_GROUPS,
  exerciseEquipment,
  exerciseSecondary,
  type Equipment,
  type ExerciseRow,
  type MuscleGroup,
} from "@/src/types/gym";
import { logger } from "@/src/utils/logger";
import { showToast } from "@/src/utils/toast";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import React, { forwardRef, useEffect, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";

interface ExerciseFormSheetProps {
  /** Chiamato dopo il salvataggio, per ricaricare l'elenco. */
  onSaved: () => void;
  /** La voce da correggere. Assente, se ne crea una nuova. */
  editing?: ExerciseRow | null;
}

/**
 * Dove si crea un esercizio che nel catalogo non c'e'.
 *
 * IL TESTO SUL CATALOGO SI LEGGE PRIMA DI SCRIVERE IL NOME, non dopo aver
 * salvato. Con un account, il nome scritto qui finisce nell'elenco comune di
 * tutti gli iscritti - non solo degli amici - ed e' l'unica cosa dell'app che
 * esce verso chi amico non e'. Dirlo a cose fatte sarebbe dirlo troppo tardi:
 * un nome pubblicato non si ritira.
 *
 * Senza account non esce niente e il testo non compare: sarebbe un avviso su
 * una cosa che non succede.
 */
export const ExerciseFormSheet = forwardRef<
  BottomSheetModal,
  ExerciseFormSheetProps
>(({ onSaved, editing }, ref) => {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const token = useAccountStore((s) => s.token);

  const [name, setName] = useState("");
  const [muscleGroup, setMuscleGroup] = useState<MuscleGroup>("petto");
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [saving, setSaving] = useState(false);

  // Riempie il modulo quando si apre su una voce da correggere, e lo svuota
  // quando si torna a crearne una nuova.
  useEffect(() => {
    setName(editing?.name ?? "");
    setMuscleGroup((editing?.muscle_group as MuscleGroup) ?? "petto");
    setEquipment(editing ? exerciseEquipment(editing) : []);
  }, [editing]);

  const condiviso = hasBackend() && token !== null;

  const toggleEquipment = (value: Equipment) =>
    setEquipment((prima) =>
      prima.includes(value)
        ? prima.filter((e) => e !== value)
        : [...prima, value],
    );

  const salva = async () => {
    const nome = name.trim();
    if (nome === "" || saving) return;

    setSaving(true);
    try {
      // Un doppione locale non lo impedisce il database: due righe con lo
      // stesso nome sono legittime nello schema, e sarebbe l'elenco degli
      // esercizi a riempirsi di gemelli. Correggendo, la voce che si sta
      // correggendo non conta come doppione di se stessa.
      const gemello = await findExerciseByName(nome);
      if (gemello && gemello.id !== editing?.id) {
        showToast.error({ title: t("gym.exercise_exists") });
        return;
      }

      if (editing) {
        await updateExercise(editing.id, {
          name: nome,
          muscleGroup,
          // I muscoli secondari non si toccano da qui: il modulo non li
          // chiede, e riscriverli con una lista vuota li perderebbe.
          secondaryMuscles: exerciseSecondary(editing),
          equipment,
          notes: editing.notes,
          instructions: editing.instructions,
        });
        void updatePublishedExercise(editing.name, {
          name: nome,
          muscleGroup,
          equipment,
        });
      } else {
        await createExercise({
          name: nome,
          muscleGroup,
          secondaryMuscles: [],
          equipment,
        });

        // Il catalogo e' un di piu' e non blocca: l'esercizio e' gia' salvato
        // qui, e senza rete resta comunque utilizzabile.
        void publishToCatalog({ name: nome, muscleGroup, equipment });
      }

      setName("");
      setEquipment([]);
      onSaved();
      showToast.success({ title: t("gym.exercise_saved") });
    } catch (error) {
      logger.warn("[palestra] esercizio non salvato", error);
      showToast.error({ title: t("general_error") });
    } finally {
      setSaving(false);
    }
  };

  return (
    <DfBottomSheet
      ref={ref}
      title={editing ? t("gym.edit_exercise") : t("gym.new_exercise")}
    >
      {condiviso ? (
        <Text style={[styles.notice, { color: colors.textMuted }]}>
          {t("gym.catalog_notice")}
        </Text>
      ) : null}

      <Text style={[styles.label, { color: colors.text }]}>
        {t("gym.exercise_name")}
      </Text>
      <TextInput
        style={[
          styles.input,
          { color: colors.text, borderColor: colors.border },
        ]}
        value={name}
        onChangeText={setName}
        placeholder={t("gym.exercise_name_placeholder")}
        placeholderTextColor={colors.textFaint}
        autoCapitalize="sentences"
      />

      <Text style={[styles.label, { color: colors.text }]}>
        {t("gym.muscle_group_label")}
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
      >
        {MUSCLE_GROUPS.map((gruppo) => (
          <Chip
            key={gruppo}
            label={t(`gym.muscle.${gruppo}`)}
            active={muscleGroup === gruppo}
            onPress={() => setMuscleGroup(gruppo)}
          />
        ))}
      </ScrollView>

      <Text style={[styles.label, { color: colors.text }]}>
        {t("gym.equipment_label")}
      </Text>
      <View style={styles.chipsWrap}>
        {EQUIPMENT.map((attrezzo) => (
          <Chip
            key={attrezzo}
            label={t(`gym.equipment.${attrezzo}`)}
            active={equipment.includes(attrezzo)}
            onPress={() => toggleEquipment(attrezzo)}
          />
        ))}
      </View>

      <DfButton
        label={t("save")}
        onPress={() => void salva()}
        disabled={name.trim() === "" || saving}
        style={styles.save}
      />
    </DfBottomSheet>
  );
});

ExerciseFormSheet.displayName = "ExerciseFormSheet";

const styles = StyleSheet.create({
  notice: {
    fontSize: 13,
    lineHeight: 18,
    paddingBottom: theme.spacing.sm,
  },
  label: {
    fontSize: 13,
    fontWeight: "700",
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.xs,
  },
  input: {
    borderWidth: 1,
    borderRadius: theme.radius.sm,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    fontSize: 15,
  },
  chips: { gap: theme.spacing.xs, paddingRight: theme.spacing.md },
  chipsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.xs,
  },
  save: { marginTop: theme.spacing.md },
});
