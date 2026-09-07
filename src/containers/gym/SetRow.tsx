import { useAppTheme } from "@/src/components/ThemeContext";
import { DraftTextInput, Text } from "@/src/components/ui";
import { useTranslation } from "@/src/hooks/useTranslation";
import { theme } from "@/src/styles";
import { sanitizeDecimalInput, sanitizeIntegerInput } from "@/src/utils/utils";
import { Check } from "lucide-react-native";
import React, { useState } from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";

interface SetRowProps {
  /** Numero mostrato all'utente, quindi 1-based. */
  setNumber: number;
  /** Presente solo nei blocchi che alternano più esercizi: lì la serie da sola non basta a capire cosa fare. */
  exerciseName?: string;
  /** Ripetizioni previste dalla scheda ("8-10"): finisce nel placeholder, non nel valore. */
  targetReps?: string | null;
  /** Valori di partenza, letti al montaggio: dopo comanda quel che si digita. */
  weight: string;
  reps: string;
  done: boolean;
  onChangeWeight: (value: string) => void;
  onChangeReps: (value: string) => void;
  onDone: () => void;
  /** Disfa la serie: torna modificabile e quel che era scritto si cancella. */
  onUndo: () => void;
}

/**
 * Una serie da spuntare. I campi sono precompilati dal chiamante con l'ultima
 * volta: qui dentro non c'è storico, solo testo modificabile.
 *
 * Spuntata, la riga si blocca: `logSet` ha già scritto la serie, e un campo
 * ancora editabile sopra una serie registrata mentirebbe. Il tondo pero' e' un
 * interruttore e non un punto di non ritorno: ritoccarlo disfa la serie
 * (`deleteSet`) e restituisce i campi, perche' il numero sbagliato ci si
 * accorge di averlo scritto un secondo dopo averlo confermato.
 *
 * **I campi sono `DraftTextInput`**: tengono il testo digitato accanto a se'
 * invece di aspettarlo da `SessionScreen`, dove ogni tasto ridisegna tutti i
 * blocchi e tutte le righe prima di restituire il carattere. Vedi il commento
 * in `DraftTextInput` per cosa faceva quel ritardo al cursore.
 */
export const SetRow: React.FC<SetRowProps> = ({
  setNumber,
  exerciseName,
  targetReps,
  weight,
  reps,
  done,
  onChangeWeight,
  onChangeReps,
  onDone,
  onUndo,
}) => {
  const { colors } = useAppTheme();
  const [focused, setFocused] = useState<"weight" | "reps" | null>(null);

  const fieldStyle = (field: "weight" | "reps") => [
    styles.input,
    {
      backgroundColor: done ? "transparent" : colors.surfaceMuted,
      borderColor: focused === field ? colors.accent : "transparent",
      color: done ? colors.textMuted : colors.text,
    },
  ];

  return (
    <View style={styles.row}>
      <View style={[styles.badge, { backgroundColor: colors.surfaceMuted }]}>
        <Text style={[styles.badgeText, { color: colors.textMuted }]}>
          {setNumber}
        </Text>
      </View>

      <View style={styles.body}>
        {exerciseName ? (
          <Text
            style={[styles.exercise, { color: colors.textSecondary }]}
            numberOfLines={1}
          >
            {exerciseName}
          </Text>
        ) : null}

        {/*
          "kg" e "rip" stavano dentro OGNI riga, quindi tre serie li
          stampavano tre volte per dire sempre la stessa cosa, e in mezzo un
          "×" che sembrava un'operazione fra i due campi. Ora le unita' sono
          l'intestazione della colonna (`SetHeader`), scritta una volta sopra
          l'elenco - e le righe restano solo numeri.
        */}
        <View style={styles.fields}>
          <DraftTextInput
            value={weight}
            onChangeText={onChangeWeight}
            sanitize={sanitizeDecimalInput}
            onFocus={() => setFocused("weight")}
            onBlur={() => setFocused(null)}
            editable={!done}
            keyboardType="decimal-pad"
            selectTextOnFocus
            placeholder="-"
            placeholderTextColor={colors.textFaint}
            style={fieldStyle("weight")}
          />
          <DraftTextInput
            value={reps}
            onChangeText={onChangeReps}
            sanitize={sanitizeIntegerInput}
            onFocus={() => setFocused("reps")}
            onBlur={() => setFocused(null)}
            editable={!done}
            keyboardType="number-pad"
            selectTextOnFocus
            placeholder={targetReps ?? "-"}
            placeholderTextColor={colors.textFaint}
            style={fieldStyle("reps")}
          />
        </View>
      </View>

      <TouchableOpacity
        onPress={done ? onUndo : onDone}
        activeOpacity={0.6}
        hitSlop={8}
        style={[
          styles.check,
          done
            ? { backgroundColor: theme.colors.success }
            : { borderWidth: 1.5, borderColor: colors.border },
        ]}
      >
        <Check
          size={22}
          strokeWidth={3}
          color={done ? theme.colors.white : colors.textFaint}
        />
      </TouchableOpacity>
    </View>
  );
};

/**
 * L'intestazione delle colonne di un elenco di serie.
 *
 * Le misure sono le stesse di `SetRow` e devono restarlo: il segnaposto a
 * sinistra e' largo quanto il numero della serie, quello a destra quanto il
 * tondo della spunta. Cambiando una misura li' va cambiata anche qui, o le
 * etichette smettono di stare sopra la loro colonna.
 */
export const SetHeader: React.FC = () => {
  const { t } = useTranslation();
  const { colors } = useAppTheme();

  return (
    <View style={styles.header}>
      <View style={styles.badge} />
      {/* `styles.body` come nella riga: li' i campi stanno dentro un contenitore
          `flex: 1`, e senza lo stesso involucro le etichette si stringevano sul
          proprio testo invece di stare sopra la loro colonna. */}
      <View style={styles.body}>
        <View style={styles.fields}>
          <Text style={[styles.headerLabel, { color: colors.textMuted }]}>
            {t("gym.kg")}
          </Text>
          <Text style={[styles.headerLabel, { color: colors.textMuted }]}>
            {t("gym.reps")}
          </Text>
        </View>
      </View>
      <View style={styles.check} />
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
  badge: {
    width: 28,
    height: 28,
    borderRadius: theme.radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { fontSize: 13, fontWeight: "700" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    paddingBottom: 2,
  },
  headerLabel: {
    flex: 1,
    fontSize: 11,
    fontWeight: "600",
    textAlign: "center",
  },
  body: { flex: 1, gap: 2 },
  exercise: { flexShrink: 1, fontSize: 12, fontWeight: "600" },
  fields: { flexDirection: "row", alignItems: "center", gap: theme.spacing.sm },
  input: {
    flex: 1,
    minWidth: 0,
    height: 44,
    fontSize: 17,
    fontWeight: "600",
    textAlign: "center",
    // Su Android un input ad altezza fissa allinea il testo in alto.
    textAlignVertical: "center",
    borderWidth: 1.5,
    borderRadius: theme.radius.lg,
    paddingHorizontal: theme.spacing.sm,
  },
  // 48x48: si preme con il pollice, spesso di fretta e con le mani sudate.
  check: {
    width: 48,
    height: 48,
    borderRadius: theme.radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
});
