import { DfBottomSheet } from "@/src/components/DfBottomSheet";
import { useAppTheme } from "@/src/components/ThemeContext";
import { DraftTextInput, Text } from "@/src/components/ui";
import { birthdatePickerStart, toIsoDate } from "@/src/domain/date";
import { useTranslation } from "@/src/hooks/useTranslation";
import { useTranslationStore } from "@/src/stores/translationStore";
import { theme } from "@/src/styles";
import { formatDate } from "@/src/utils/dateUtils";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import DateTimePicker, {
  DateTimePickerAndroid,
} from "@react-native-community/datetimepicker";
import { Calendar, Check, ChevronDown } from "lucide-react-native";
import React, { useRef, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import type { KeyboardTypeOptions } from "react-native";

/** La data è sempre YYYY-MM-DD: una riga, non un parser condiviso. */
function parseIso(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/**
 * I campi del wizard: stessa etichetta, stesso campo, stesso picker a foglio
 * di `TargetsScreen`.
 *
 * Stanno qui e non nella schermata che li usa perché il passo dei dati li
 * mette in griglia a due colonne, e un modulo con sei campi non si legge se
 * ognuno porta con sé le sue venti righe di selettore di sistema.
 */

export const OnboardingLabel: React.FC<{ children: string }> = ({ children }) => {
  const { colors } = useAppTheme();
  return <Text style={[styles.label, { color: colors.textMuted }]}>{children}</Text>;
};

/**
 * `DraftTextInput` e non `TextInput`: altezza e peso stanno in cima a
 * `OnboardingProfileScreen`, e ogni tasto ricalcola il fabbisogno e ridisegna
 * l'hero prima di restituire il carattere.
 *
 * Misurato invece che supposto, e il modo di rifarlo: si monta la schermata
 * vera con `react-test-renderer` (solo `DfBottomSheet` sostituito da una
 * `View`, che gorhom sotto jest non si inizializza), si riempiono altezza e
 * peso - da li' in poi l'hero mostra un numero, cioe' il caso peggiore - e si
 * cronometra il render sincrono di una battuta sul campo del peso. Contro un
 * componente che contiene un `TextInput` e nient'altro, che e' il pavimento.
 * Su un Mac, in Node, il pavimento sta sotto il millesimo e questa schermata
 * sta fra i 7 e gli 8 ms di mediana: meta' fotogramma nel solo JS, sulla
 * macchina piu' veloce della catena e senza il livello nativo dall'altra
 * parte. Su un telefono quel giro non chiude in tempo.
 */
export const OnboardingTextField: React.FC<{
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
}> = ({ value, onChangeText, placeholder, keyboardType = "decimal-pad" }) => {
  const { colors } = useAppTheme();
  return (
    <DraftTextInput
      value={value}
      onChangeText={onChangeText}
      keyboardType={keyboardType}
      placeholder={placeholder}
      placeholderTextColor={colors.textFaint}
      style={[
        styles.input,
        { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text },
      ]}
    />
  );
};

/**
 * Il campo della data di nascita, col selettore di sistema.
 *
 * Sta qui e non nella schermata perché la parte iOS - una modale con la ruota,
 * "Annulla" e "Conferma" - è venti righe che nessuno vuole rileggere in mezzo
 * a un modulo. La ruota di una data mancante parte da trent'anni fa e non da
 * oggi: vedi `birthdatePickerStart`.
 */
export const OnboardingDateField: React.FC<{
  /** ISO YYYY-MM-DD, oppure vuoto. */
  value: string;
  onChange: (iso: string) => void;
}> = ({ value, onChange }) => {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  // La ruota iOS aveva `locale="it"` scritto a mano: dal passaggio a due
  // lingue quel mese in italiano compariva anche a chi usa l'app in inglese.
  const language = useTranslationStore((s) => s.language);
  const [showIosPicker, setShowIosPicker] = useState(false);
  const [tempDate, setTempDate] = useState<Date>(birthdatePickerStart());

  const open = () => {
    const base = value.length === 10 ? parseIso(value) : birthdatePickerStart();
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: base,
        mode: "date",
        maximumDate: new Date(),
        onChange: (event, selected) => {
          if (event.type === "set" && selected) onChange(toIsoDate(selected));
        },
      });
    } else {
      setTempDate(base);
      setShowIosPicker(true);
    }
  };

  return (
    <>
      <TouchableOpacity
        onPress={open}
        activeOpacity={0.6}
        accessibilityRole="button"
        style={[
          styles.dateBtn,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        <Calendar size={16} color={colors.textMuted} />
        <Text
          style={[
            styles.dateText,
            { color: value ? colors.text : colors.textFaint },
          ]}
          numberOfLines={1}
        >
          {value ? formatDate(value) : t("select_date_placeholder")}
        </Text>
      </TouchableOpacity>

      {showIosPicker ? (
        <Modal
          transparent
          animationType="fade"
          onRequestClose={() => setShowIosPicker(false)}
        >
          <Pressable
            style={styles.iosOverlay}
            onPress={() => setShowIosPicker(false)}
          >
            <Pressable
              style={[styles.iosContent, { backgroundColor: colors.surface }]}
            >
              <View
                style={[styles.iosHeader, { borderBottomColor: colors.border }]}
              >
                <Pressable onPress={() => setShowIosPicker(false)}>
                  <Text style={[styles.iosCancel, { color: colors.textMuted }]}>
                    {t("cancel")}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    onChange(toIsoDate(tempDate));
                    setShowIosPicker(false);
                  }}
                >
                  <Text style={[styles.iosConfirm, { color: colors.accent }]}>
                    {t("confirm")}
                  </Text>
                </Pressable>
              </View>
              <DateTimePicker
                value={tempDate}
                mode="date"
                display="spinner"
                locale={language}
                maximumDate={new Date()}
                onChange={(_event, selected) => {
                  if (selected) setTempDate(selected);
                }}
              />
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}
    </>
  );
};

export function OnboardingPicker<T extends string>({
  label,
  title,
  values,
  selected,
  labelKey,
  onSelect,
}: {
  label: string;
  title: string;
  values: readonly T[];
  selected: T;
  /** `t(`${labelKey}.${value}`)` dà l'etichetta di ogni valore. */
  labelKey: string;
  onSelect: (value: T) => void;
}) {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const sheetRef = useRef<BottomSheetModal>(null);

  return (
    <View>
      <OnboardingLabel>{label}</OnboardingLabel>
      <TouchableOpacity
        onPress={() => sheetRef.current?.present()}
        activeOpacity={0.6}
        style={[styles.selectBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
      >
        <Text style={[styles.selectBtnText, { color: colors.text }]}>
          {t(`${labelKey}.${selected}`)}
        </Text>
        <ChevronDown size={18} color={colors.textMuted} />
      </TouchableOpacity>

      <DfBottomSheet ref={sheetRef} title={title}>
        {values.map((value, index) => {
          const isSelected = value === selected;
          return (
            <TouchableOpacity
              key={value}
              activeOpacity={0.6}
              style={[
                styles.pickerRow,
                {
                  borderBottomColor: colors.border,
                  borderBottomWidth: index === values.length - 1 ? 0 : 1,
                },
              ]}
              onPress={() => {
                onSelect(value);
                sheetRef.current?.dismiss();
              }}
            >
              <Text style={[styles.pickerRowText, { color: colors.text }]}>
                {t(`${labelKey}.${value}`)}
              </Text>
              {isSelected && <Check size={18} color={colors.accent} />}
            </TouchableOpacity>
          );
        })}
      </DfBottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  // Etichetta di campo: vedi la nota su `FieldLabel` in kal/Primitives.
  label: {
    fontSize: 14,
    fontWeight: "500",
    marginTop: theme.spacing.md,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderRadius: theme.radius.lg,
    paddingHorizontal: theme.spacing.md,
    // md come i bottoni-select/data qui sotto: stessa altezza per ogni campo
    // del wizard.
    paddingVertical: theme.spacing.md,
    fontSize: 15,
  },
  selectBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderRadius: theme.radius.lg,
    paddingHorizontal: theme.spacing.md,
    // md come le righe che elenca: un select pesa quanto una riga di lista,
    // in tutto il progetto.
    paddingVertical: theme.spacing.md,
  },
  selectBtnText: { fontSize: 15 },
  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: theme.spacing.md,
  },
  pickerRowText: { fontSize: 15, fontWeight: "500" },
  dateBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    borderWidth: 1,
    borderRadius: theme.radius.lg,
    paddingHorizontal: theme.spacing.md,
    // md come gli altri campi del wizard: stessa altezza per tutti.
    paddingVertical: theme.spacing.md,
  },
  dateText: { flexShrink: 1, fontSize: 15 },
  iosOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  iosContent: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 32,
    alignItems: "center",
  },
  iosHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    alignSelf: "stretch",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iosCancel: { fontSize: 16 },
  iosConfirm: { fontSize: 16, fontWeight: "600" },
});
