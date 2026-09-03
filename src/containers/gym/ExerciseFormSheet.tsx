import { hasBackend } from "@/src/api/config";
import { DfBottomSheet } from "@/src/components/DfBottomSheet";
import { DfButton } from "@/src/components/form/DfButton";
import { PhotoField } from "@/src/components/kal";
import { useAppTheme } from "@/src/components/ThemeContext";
import { Text, TextInput } from "@/src/components/ui";
import {
  createExercise,
  findExerciseByName,
  updateExercise,
} from "@/src/db/queries/exercises";
import { useTranslation } from "@/src/hooks/useTranslation";
import {
  publishToCatalog,
  updatePublishedExercise,
} from "@/src/services/exerciseCatalog";
import { useAccountStore } from "@/src/stores/accountStore";
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
import { Check, ChevronRight } from "lucide-react-native";
import React, { forwardRef, useCallback, useEffect, useState } from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";

interface ExerciseFormSheetProps {
  /** Chiamato dopo il salvataggio, per ricaricare l'elenco. */
  onSaved: () => void;
  /** La voce da correggere. Assente, se ne crea una nuova. */
  editing?: ExerciseRow | null;
}

/** Il corpo del foglio: il modulo, o la sotto-vista che sceglie un campo. */
type FormView = "form" | "muscle" | "secondary" | "equipment";

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
 *
 * I tre campi a scelta (gruppo muscolare, muscoli secondari, attrezzatura)
 * aprono una sotto-vista invece di un elenco di chip in pagina: sono in
 * dodici + undici opzioni, e in chip inline riempivano il modulo di righe
 * a capo. La sotto-vista vive DENTRO questo stesso `BottomSheetModal`
 * (titolo che diventa "indietro", corpo che si scambia) e non in un secondo
 * foglio impilato sopra: nessun altro punto del progetto annida due
 * `BottomSheetModal`, e la libreria non garantisce che il gesto di
 * trascinamento arrivi a quello giusto quando sono due.
 */
export const ExerciseFormSheet = forwardRef<
  BottomSheetModal,
  ExerciseFormSheetProps
>(({ onSaved, editing }, ref) => {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const token = useAccountStore((s) => s.token);

  const [view, setView] = useState<FormView>("form");
  const [name, setName] = useState("");
  const [muscleGroup, setMuscleGroup] = useState<MuscleGroup>("petto");
  const [secondary, setSecondary] = useState<MuscleGroup[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Riempie il modulo quando si apre su una voce da correggere, e lo svuota
  // quando si torna a crearne una nuova.
  useEffect(() => {
    setName(editing?.name ?? "");
    setMuscleGroup((editing?.muscle_group as MuscleGroup) ?? "petto");
    setSecondary(editing ? exerciseSecondary(editing) : []);
    setEquipment(editing ? exerciseEquipment(editing) : []);
    setPhotoUri(editing?.photo_uri ?? null);
    setView("form");
  }, [editing]);

  const condiviso = hasBackend() && token !== null;

  const toggleSecondary = (value: MuscleGroup) =>
    setSecondary((prima) =>
      prima.includes(value)
        ? prima.filter((m) => m !== value)
        : [...prima, value],
    );

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
          secondaryMuscles: secondary,
          equipment,
          notes: editing.notes,
          instructions: editing.instructions,
          photoUri,
        });
        void updatePublishedExercise(editing.name, {
          name: nome,
          muscleGroup,
          secondaryMuscles: secondary,
          equipment,
        });
      } else {
        await createExercise({
          name: nome,
          muscleGroup,
          secondaryMuscles: secondary,
          equipment,
          photoUri,
        });

        // Il catalogo e' un di piu' e non blocca: l'esercizio e' gia' salvato
        // qui, e senza rete resta comunque utilizzabile.
        void publishToCatalog({
          name: nome,
          muscleGroup,
          secondaryMuscles: secondary,
          equipment,
        });
      }

      setName("");
      setSecondary([]);
      setEquipment([]);
      setPhotoUri(null);
      onSaved();
      showToast.success({ title: t("gym.exercise_saved") });
    } catch (error) {
      logger.warn("[palestra] esercizio non salvato", error);
      showToast.error({ title: t("general_error") });
    } finally {
      setSaving(false);
    }
  };

  const onAndroidBack = useCallback(() => {
    if (view === "form") return false;
    setView("form");
    return true;
  }, [view]);

  const title = (): string => {
    if (view === "muscle") return t("gym.pick_muscle_group");
    if (view === "secondary") return t("gym.pick_secondary_muscles");
    if (view === "equipment") return t("gym.pick_equipment");
    return editing ? t("gym.edit_exercise") : t("gym.new_exercise");
  };

  return (
    <DfBottomSheet
      ref={ref}
      title={title()}
      onPressTitle={view !== "form" ? () => setView("form") : undefined}
      titleOpen={view !== "form"}
      onAndroidBack={onAndroidBack}
      onDismiss={() => setView("form")}
    >
      {view === "muscle" ? (
        <View>
          {MUSCLE_GROUPS.map((gruppo, index) => (
            <PickRow
              key={gruppo}
              label={t(`gym.muscle.${gruppo}`)}
              selected={muscleGroup === gruppo}
              isLast={index === MUSCLE_GROUPS.length - 1}
              onPress={() => {
                setMuscleGroup(gruppo);
                // Il principale non e' anche secondario: comparirebbe due
                // volte nella stessa scheda e falserebbe le alternative.
                setSecondary((prima) => prima.filter((m) => m !== gruppo));
                setView("form");
              }}
            />
          ))}
        </View>
      ) : view === "secondary" ? (
        <View>
          {(() => {
            const opzioni = MUSCLE_GROUPS.filter((g) => g !== muscleGroup);
            return opzioni.map((gruppo, index) => (
              <PickRow
                key={gruppo}
                label={t(`gym.muscle.${gruppo}`)}
                selected={secondary.includes(gruppo)}
                isLast={index === opzioni.length - 1}
                onPress={() => toggleSecondary(gruppo)}
              />
            ));
          })()}
        </View>
      ) : view === "equipment" ? (
        <View>
          {EQUIPMENT.map((attrezzo, index) => (
            <PickRow
              key={attrezzo}
              label={t(`gym.equipment.${attrezzo}`)}
              selected={equipment.includes(attrezzo)}
              isLast={index === EQUIPMENT.length - 1}
              onPress={() => toggleEquipment(attrezzo)}
            />
          ))}
        </View>
      ) : (
        <>
          <Text style={[styles.label, { color: colors.text }]}>
            {t("gym.photo_label")}
          </Text>
          <PhotoField
            uri={photoUri}
            onChange={setPhotoUri}
            height={140}
            prefix="exercise"
          />

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
          <FieldButton
            value={t(`gym.muscle.${muscleGroup}`)}
            onPress={() => setView("muscle")}
          />

          <Text style={[styles.label, { color: colors.text }]}>
            {t("gym.secondary_muscles_label")}
          </Text>
          <FieldButton
            value={
              secondary.length > 0
                ? secondary.map((m) => t(`gym.muscle.${m}`)).join(", ")
                : t("gym.no_secondary_selected")
            }
            onPress={() => setView("secondary")}
          />

          <Text style={[styles.label, { color: colors.text }]}>
            {t("gym.equipment_label")}
          </Text>
          <FieldButton
            value={
              equipment.length > 0
                ? equipment.map((e) => t(`gym.equipment.${e}`)).join(", ")
                : t("gym.no_equipment_selected")
            }
            onPress={() => setView("equipment")}
          />

          <DfButton
            label={t("save")}
            onPress={() => void salva()}
            disabled={name.trim() === "" || saving}
            style={styles.save}
          />
        </>
      )}
    </DfBottomSheet>
  );
});

ExerciseFormSheet.displayName = "ExerciseFormSheet";

const FieldButton: React.FC<{ value: string; onPress: () => void }> = ({
  value,
  onPress,
}) => {
  const { colors } = useAppTheme();

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.6}
      style={[styles.fieldButton, { borderColor: colors.border }]}
    >
      <Text
        style={[styles.fieldValue, { color: colors.text }]}
        numberOfLines={1}
      >
        {value}
      </Text>
      <ChevronRight size={18} color={colors.textMuted} />
    </TouchableOpacity>
  );
};

const PickRow: React.FC<{
  label: string;
  selected: boolean;
  isLast: boolean;
  onPress: () => void;
}> = ({ label, selected, isLast, onPress }) => {
  const { colors } = useAppTheme();

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.6}
      style={[
        styles.pickRow,
        { borderBottomColor: colors.border, borderBottomWidth: isLast ? 0 : 1 },
      ]}
    >
      <Text
        style={[
          styles.pickLabel,
          { color: selected ? colors.accent : colors.text },
        ]}
      >
        {label}
      </Text>
      {selected ? <Check size={18} color={colors.accent} /> : null}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  notice: {
    fontSize: 13,
    lineHeight: 18,
    paddingBottom: theme.spacing.sm,
    paddingTop: theme.spacing.sm,
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
    paddingVertical: theme.spacing.md,
    fontSize: 15,
  },
  fieldButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing.sm,
    borderWidth: 1,
    borderRadius: theme.radius.sm,
    paddingHorizontal: theme.spacing.sm,
    // Stessa altezza delle righe di un drawer di scelta (vedi PickRow): un
    // campo che apre una scelta e' la stessa cosa di una riga che la elenca,
    // e deve pesare uguale sotto al tocco.
    paddingVertical: theme.spacing.md,
  },
  fieldValue: { flex: 1, fontSize: 15, textTransform: "capitalize" },
  pickRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    // md come il drawer di riferimento (scelta pasto in AddEntrySheet), non
    // sm: e' la stessa altezza di riga in tutti i drawer di selezione.
    paddingVertical: theme.spacing.md,
  },
  pickLabel: { fontSize: 15, fontWeight: "500", textTransform: "capitalize" },
  save: { marginTop: theme.spacing.md },
});
