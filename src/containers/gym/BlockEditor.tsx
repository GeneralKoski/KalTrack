import { Chip, MetalPanel } from "@/src/components/kal";
import { useAppTheme } from "@/src/components/ThemeContext";
import { Text, TextInput } from "@/src/components/ui";
import { useTranslation } from "@/src/hooks/useTranslation";
import { theme } from "@/src/styles";
import type { BlockKind, MuscleGroup } from "@/src/types/gym";
import { ArrowDown, Plus, Trash2, X } from "lucide-react-native";
import React from "react";
import { ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";

/**
 * Numeri e ripetizioni restano testo finché si è nel form: "3" a metà digitazione
 * può essere una stringa vuota, e le ripetizioni bersaglio sono spesso un
 * intervallo ("8-10"). La conversione avviene una volta sola, al salvataggio.
 */
export interface DraftExercise {
  key: string;
  exerciseId: string;
  name: string;
  muscleGroup: MuscleGroup;
  sets: string;
  reps: string;
}

export interface DraftBlock {
  key: string;
  kind: BlockKind;
  rest: string;
  exercises: DraftExercise[];
}

const BLOCK_KINDS: BlockKind[] = ["single", "superset", "circuit", "dropset"];

/** Un blocco con più esercizi da eseguire insieme, non uno dopo l'altro. */
export const isGrouped = (kind: BlockKind): boolean => kind !== "single";

const HINT_KEYS: Record<BlockKind, string | null> = {
  single: null,
  superset: "gym.superset_hint",
  circuit: "gym.circuit_hint",
  dropset: "gym.dropset_hint",
};

/** A, B, C… identificano il blocco; A1, A2 gli esercizi che stanno dentro. */
const blockLetter = (index: number): string =>
  String.fromCharCode(65 + (index % 26));

interface BlockEditorProps {
  block: DraftBlock;
  index: number;
  onChange: (next: DraftBlock) => void;
  onRemove: () => void;
  onAddExercise: () => void;
}

export const BlockEditor: React.FC<BlockEditorProps> = ({
  block,
  index,
  onChange,
  onRemove,
  onAddExercise,
}) => {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const grouped = isGrouped(block.kind);
  const letter = blockLetter(index);
  const hintKey = HINT_KEYS[block.kind];

  const updateExercise = (key: string, patch: Partial<DraftExercise>) =>
    onChange({
      ...block,
      exercises: block.exercises.map((item) =>
        item.key === key ? { ...item, ...patch } : item,
      ),
    });

  const removeExercise = (key: string) =>
    onChange({
      ...block,
      exercises: block.exercises.filter((item) => item.key !== key),
    });

  const content = (
    <>
      <View style={styles.head}>
        <View style={[styles.letter, { backgroundColor: colors.accent }]}>
          <Text style={[styles.letterText, { color: colors.accentOn }]}>
            {letter}
          </Text>
        </View>
        <Text
          style={[styles.kindName, { color: colors.text }]}
          numberOfLines={1}
        >
          {t(`gym.block_${block.kind}`)}
        </Text>
        <TouchableOpacity onPress={onRemove} activeOpacity={0.6} hitSlop={10}>
          <Trash2 size={18} color={colors.textFaint} />
        </TouchableOpacity>
      </View>

      {/* Quattro tipi oggi, ma la riga resta scorrevole: non deve andare a capo. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.kinds}
      >
        {BLOCK_KINDS.map((kind) => (
          <Chip
            key={kind}
            label={t(`gym.block_${kind}`)}
            active={kind === block.kind}
            onPress={() => onChange({ ...block, kind })}
          />
        ))}
      </ScrollView>

      {hintKey ? (
        <Text style={[styles.hint, { color: colors.textMuted }]}>
          {t(hintKey)}
        </Text>
      ) : null}

      <View style={styles.group}>
        {/*
          La graffa a sinistra tiene insieme gli esercizi del blocco: senza,
          un superset sarebbe indistinguibile da due esercizi accostati.
        */}
        {grouped ? (
          <View style={[styles.bracket, { borderColor: colors.accent }]} />
        ) : null}

        <View style={styles.groupBody}>
          {block.exercises.map((exercise, position) => (
            <React.Fragment key={exercise.key}>
              {grouped && position > 0 ? (
                <View style={styles.link}>
                  <ArrowDown size={12} color={colors.textFaint} />
                  <Text
                    style={[styles.linkText, { color: colors.textFaint }]}
                    numberOfLines={1}
                  >
                    {t("gym.then_immediately")}
                  </Text>
                </View>
              ) : null}

              <View style={styles.exercise}>
                <View style={styles.exerciseHead}>
                  <Text
                    style={[styles.tag, { color: colors.textMuted }]}
                    numberOfLines={1}
                  >
                    {grouped ? `${letter}${position + 1}` : letter}
                  </Text>
                  <Text
                    style={[styles.name, { color: colors.text }]}
                    numberOfLines={1}
                  >
                    {exercise.name}
                  </Text>
                  <TouchableOpacity
                    onPress={() => removeExercise(exercise.key)}
                    activeOpacity={0.6}
                    hitSlop={10}
                  >
                    <X size={16} color={colors.textFaint} />
                  </TouchableOpacity>
                </View>

                <View style={styles.fields}>
                  <MiniField
                    label={t("gym.sets")}
                    value={exercise.sets}
                    keyboardType="number-pad"
                    width={56}
                    onChangeText={(value) =>
                      updateExercise(exercise.key, { sets: value })
                    }
                  />
                  <MiniField
                    label={t("gym.reps")}
                    value={exercise.reps}
                    placeholder={t("gym.reps_placeholder")}
                    width={84}
                    onChangeText={(value) =>
                      updateExercise(exercise.key, { reps: value })
                    }
                  />
                  <Text
                    style={[styles.muscle, { color: colors.textFaint }]}
                    numberOfLines={1}
                  >
                    {t(`gym.muscle.${exercise.muscleGroup}`)}
                  </Text>
                </View>
              </View>
            </React.Fragment>
          ))}
        </View>
      </View>

      <View style={styles.footer}>
        <MiniField
          label={t("gym.rest_seconds")}
          value={block.rest}
          keyboardType="number-pad"
          width={72}
          onChangeText={(value) => onChange({ ...block, rest: value })}
        />
        <TouchableOpacity
          onPress={onAddExercise}
          activeOpacity={0.6}
          style={[styles.add, { borderColor: colors.border }]}
        >
          <Plus size={16} color={colors.text} />
          <Text style={[styles.addLabel, { color: colors.text }]} numberOfLines={1}>
            {t("gym.add_exercise")}
          </Text>
        </TouchableOpacity>
      </View>
    </>
  );

  // Il blocco di gruppo è una lastra sola: il metallo dice "questo è un pezzo
  // unico" meglio di qualunque etichetta, e il singolo resta piatto per contrasto.
  if (grouped) {
    return (
      <MetalPanel radius={theme.radius.xl} style={styles.block}>
        {content}
      </MetalPanel>
    );
  }

  return (
    <View
      style={[
        styles.block,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderWidth: 1,
        },
      ]}
    >
      {content}
    </View>
  );
};

const MiniField: React.FC<{
  label: string;
  value: string;
  width: number;
  placeholder?: string;
  keyboardType?: "number-pad" | "default";
  onChangeText: (value: string) => void;
}> = ({ label, value, width, placeholder, keyboardType = "default", onChangeText }) => {
  const { colors } = useAppTheme();

  return (
    <View style={{ width }}>
      <Text style={[styles.fieldLabel, { color: colors.textMuted }]} numberOfLines={1}>
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textFaint}
        keyboardType={keyboardType}
        style={[
          styles.field,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            color: colors.text,
          },
        ]}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  block: {
    borderRadius: theme.radius.xl,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  letter: {
    width: 24,
    height: 24,
    borderRadius: theme.radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  letterText: { fontSize: 13, fontWeight: "700" },
  kindName: { flexShrink: 1, flexGrow: 1, fontSize: 15, fontWeight: "700" },
  kinds: { gap: theme.spacing.xs },
  hint: { fontSize: 12, lineHeight: 17 },
  group: {
    flexDirection: "row",
    gap: theme.spacing.sm,
  },
  bracket: {
    width: 10,
    borderLeftWidth: 2,
    borderTopWidth: 2,
    borderBottomWidth: 2,
    borderTopLeftRadius: theme.radius.sm,
    borderBottomLeftRadius: theme.radius.sm,
    marginVertical: theme.spacing.xs,
  },
  groupBody: { flex: 1 },
  link: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs,
    paddingVertical: theme.spacing.xs,
  },
  linkText: {
    flexShrink: 1,
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  exercise: { paddingVertical: theme.spacing.xs },
  exerciseHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  tag: { fontSize: 12, fontWeight: "700", minWidth: 22 },
  name: { flexShrink: 1, flexGrow: 1, fontSize: 15, fontWeight: "600" },
  fields: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: theme.spacing.sm,
    marginTop: theme.spacing.xs,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: "600",
    marginBottom: 2,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  field: {
    borderWidth: 1,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 6,
    fontSize: 15,
    textAlign: "center",
  },
  muscle: { flexShrink: 1, fontSize: 12, paddingBottom: 8 },
  footer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: theme.spacing.sm,
  },
  add: {
    flexGrow: 1,
    flexShrink: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing.xs,
    borderWidth: 1,
    borderRadius: theme.radius.md,
    paddingVertical: 8,
    paddingHorizontal: theme.spacing.sm,
  },
  addLabel: { flexShrink: 1, fontSize: 13, fontWeight: "600" },
});
