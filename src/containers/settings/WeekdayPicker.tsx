import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import { useTranslation } from "@/src/hooks/useTranslation";
import { theme } from "@/src/styles";
import React from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";

export const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

/**
 * I sette giorni della settimana, tutti e sette in riga.
 *
 * Erano sette `Chip` a piena misura dentro uno `ScrollView` orizzontale: per
 * vedere sabato e domenica si doveva scorrere, in un selettore dove il punto
 * e' proprio vedere quali giorni sono accesi e quali no. Sette caselle da 40
 * entrano nella larghezza dello schermo e la risposta si legge in un colpo.
 *
 * **Lo stato spento e' un colore, non un'opacita'.** La riga si abbassava a
 * `opacity: 0.45`, che su un chip pieno sbiadisce insieme sfondo e testo verso
 * il fondo: il risultato erano caselle grigie con dentro un testo quasi
 * illeggibile, che sembravano rotte piu' che spente. Qui il giorno spento e'
 * una casella tenue col testo tenue, e resta leggibile.
 */
export const WeekdayPicker: React.FC<{
  /** Giorni accesi, 0 = domenica. */
  value: number[];
  onToggle: (day: number) => void;
  /** Il promemoria e' spento: tutto si smorza, ma resta leggibile. */
  muted?: boolean;
}> = ({ value, onToggle, muted = false }) => {
  const { t } = useTranslation();
  const { colors } = useAppTheme();

  return (
    <View style={styles.row}>
      {WEEKDAYS.map((day) => {
        const active = value.includes(day);
        return (
          <TouchableOpacity
            key={day}
            onPress={() => onToggle(day)}
            activeOpacity={0.6}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={t(`reminders.weekdays.${day}`)}
            style={[
              styles.day,
              active
                ? {
                    backgroundColor: muted ? colors.surfaceMuted : colors.accent,
                    borderColor: muted ? colors.border : colors.accent,
                  }
                : {
                    backgroundColor: "transparent",
                    borderColor: colors.border,
                  },
            ]}
          >
            <Text
              style={[
                styles.label,
                {
                  color: active
                    ? muted
                      ? colors.textSecondary
                      : colors.accentOn
                    : colors.textFaint,
                },
              ]}
              numberOfLines={1}
            >
              {t(`reminders.weekdays.${day}`)}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 6 },
  day: {
    flexGrow: 1,
    flexBasis: 0,
    height: 36,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  label: { fontSize: 12, fontWeight: "600" },
});
