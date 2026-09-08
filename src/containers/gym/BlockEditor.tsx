import { MetalPanel, Segmented } from "@/src/components/kal";
import { useAppTheme } from "@/src/components/ThemeContext";
import { DraftTextInput, Text } from "@/src/components/ui";
import { useTranslation } from "@/src/hooks/useTranslation";
import { useTaxonomyStore } from "@/src/stores/taxonomyStore";
import { theme } from "@/src/styles";
import type { BlockKind, MuscleGroup } from "@/src/types/gym";
import { ArrowDown, Plus, Trash2, X } from "lucide-react-native";
import React from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";

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
  /** Carico di lavoro in kg. Vuoto non e' "0 kg": e' "non lo decido qui". */
  weight: string;
}

export interface DraftBlock {
  key: string;
  kind: BlockKind;
  rest: string;
  exercises: DraftExercise[];
}

const BLOCK_KINDS: BlockKind[] = ["single", "superset", "circuit", "dropset"];

/**
 * Altezza esplicita, non affidata a padding+contenuto: un `TextInput` e un
 * `TouchableOpacity` con la stessa imbottitura non arrivano comunque alla
 * stessa altezza, perché la metrica del font di un input a riga singola non
 * coincide con quella di una riga icona+testo. Con l'altezza fissata qui, e
 * uguale sui due, il confronto non dipende più da quella differenza.
 */
const MINI_CONTROL_HEIGHT = 52;

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
  const muscleLabel = useTaxonomyStore((s) => s.muscleLabel);
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
      {/*
        Il tipo del blocco si diceva DUE volte: un titolo "A · Singolo" e sotto
        una riga di chip con "Singolo" selezionato. Il selettore da solo lo dice
        gia', e la riga scorrevole tagliava "Dropset" a "Drops" - in un
        selettore, dove il punto e' vedere le alternative. Quattro segmenti in
        larghezza piena ci stanno tutti.
      */}
      <View style={styles.head}>
        <View style={[styles.letter, { backgroundColor: colors.accent }]}>
          <Text style={[styles.letterText, { color: colors.accentOn }]}>
            {letter}
          </Text>
        </View>

        <Segmented
          compact
          style={styles.kinds}
          value={block.kind}
          onChange={(kind) => onChange({ ...block, kind })}
          options={BLOCK_KINDS.map((kind) => ({
            value: kind,
            label: t(`gym.block_${kind}`),
          }))}
        />

        <TouchableOpacity onPress={onRemove} activeOpacity={0.6} hitSlop={10}>
          <Trash2 size={18} color={colors.textFaint} />
        </TouchableOpacity>
      </View>

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
                  {/* Il gruppo muscolare stava in coda ai tre campi, sulla
                      stessa riga del campo KG: sembrava il valore dei
                      chilogrammi. E' un dato dell'esercizio, e sta sotto il
                      suo nome. */}
                  <View style={styles.names}>
                    <Text
                      style={[styles.name, { color: colors.text }]}
                      numberOfLines={1}
                    >
                      {exercise.name}
                    </Text>
                    <Text
                      style={[styles.muscle, { color: colors.textMuted }]}
                      numberOfLines={1}
                    >
                      {muscleLabel(exercise.muscleGroup)}
                    </Text>
                  </View>
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
                  <MiniField
                    label={t("gym.kg")}
                    value={exercise.weight}
                    keyboardType="decimal-pad"
                    width={60}
                    onChangeText={(value) =>
                      updateExercise(exercise.key, { weight: value })
                    }
                  />
                </View>
              </View>
            </React.Fragment>
          ))}
        </View>
      </View>

      {/*
        Erano affiancati e alti uguale: un campo numerico e un bottone, che
        letti insieme sembravano due bottoni - e per allinearli serviva
        un'etichetta invisibile come zeppa. Il recupero e' un dato del blocco e
        sta su una riga sua; l'aggiunta e' un'azione e sta sotto, a tutta
        larghezza, come "Aggiungi qui" nel diario.
      */}
      <View style={[styles.restRow, { borderTopColor: colors.border }]}>
        <Text style={[styles.restLabel, { color: colors.textMuted }]} numberOfLines={1}>
          {t("gym.rest_seconds")}
        </Text>
        <DraftTextInput
          value={block.rest}
          onChangeText={(value) => onChange({ ...block, rest: value })}
          keyboardType="number-pad"
          style={[
            styles.restField,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              color: colors.text,
            },
          ]}
        />
      </View>

      <TouchableOpacity
        onPress={onAddExercise}
        activeOpacity={0.6}
        accessibilityRole="button"
        style={styles.add}
      >
        <Plus size={14} color={colors.textMuted} />
        <Text style={[styles.addLabel, { color: colors.textMuted }]} numberOfLines={1}>
          {t("gym.add_exercise")}
        </Text>
      </TouchableOpacity>
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

/**
 * `DraftTextInput` e non `TextInput`: `days` sta in `RoutineFormScreen`, quindi
 * ogni tasto qui dentro ricostruisce tutte le giornate e ridisegna tutti i
 * blocchi coi loro campi prima di restituire il carattere. Vedi il commento in
 * `DraftTextInput` per cosa faceva quel ritardo al cursore.
 */
const MiniField: React.FC<{
  label: string;
  value: string;
  width: number;
  placeholder?: string;
  keyboardType?: "number-pad" | "decimal-pad" | "default";
  onChangeText: (value: string) => void;
}> = ({ label, value, width, placeholder, keyboardType = "default", onChangeText }) => {
  const { colors } = useAppTheme();

  return (
    <View style={{ width }}>
      <Text style={[styles.fieldLabel, { color: colors.textMuted }]} numberOfLines={1}>
        {label}
      </Text>
      <DraftTextInput
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
  // Selettore a segmenti: prende tutta la larghezza che avanza, cosi' i
  // quattro tipi entrano e nessuno viene tagliato.
  // Solo la larghezza: il selettore lo disegna `Segmented`. Qui deve prendersi
  // tutto lo spazio che avanza fra la lettera del blocco e il cestino.
  kinds: {
    flexGrow: 1,
    flexShrink: 1,
  },
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
  names: { flexShrink: 1, flexGrow: 1, gap: 1 },
  name: { fontSize: 15, fontWeight: "600" },
  fields: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: theme.spacing.sm,
    marginTop: theme.spacing.xs,
  },
  // In tondo, non in maiuscolo spaziato: e' l'etichetta di un campo largo 56
  // px, e il maiuscolo la faceva gridare piu' del numero che descrive.
  fieldLabel: {
    fontSize: 11,
    fontWeight: "500",
    marginBottom: 3,
  },
  field: {
    height: MINI_CONTROL_HEIGHT,
    borderWidth: 1,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.sm,
    fontSize: 15,
    textAlign: "center",
    // Su Android un TextInput con altezza fissa allinea il testo in alto di
    // default: senza questo il numero non sarebbe centrato nel campo.
    textAlignVertical: "center",
  },
  muscle: { fontSize: 12 },
  restRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    paddingTop: theme.spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  // Senza `flexGrow`: l'etichetta si prendeva tutta la riga e spingeva il campo
  // contro il bordo destro, con mezza riga di vuoto in mezzo fra la parola e il
  // numero che descrive. Restano accostati a sinistra, e il vuoto sta dopo.
  restLabel: { flexShrink: 1, fontSize: 13, fontWeight: "500" },
  restField: {
    width: 76,
    height: 40,
    borderWidth: 1,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.sm,
    fontSize: 15,
    textAlign: "center",
    textAlignVertical: "center",
  },
  add: {
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  addLabel: { flexShrink: 1, fontSize: 13, fontWeight: "500" },
});
