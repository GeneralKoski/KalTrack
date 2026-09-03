import { DfBottomSheet } from "@/src/components/DfBottomSheet";
import { DfButton } from "@/src/components/form/DfButton";
import { useAppTheme } from "@/src/components/ThemeContext";
import { Text, TextInput } from "@/src/components/ui";
import { todayIso, toIsoDate } from "@/src/domain/date";
import { useTranslation } from "@/src/hooks/useTranslation";
import { theme } from "@/src/styles";
import { formatDate } from "@/src/utils/dateUtils";
import { sanitizeDecimalInput } from "@/src/utils/utils";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import DateTimePicker, {
  DateTimePickerAndroid,
} from "@react-native-community/datetimepicker";
import { Calendar } from "lucide-react-native";
import React, { forwardRef, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";

// Copia locale come in ProgressPhotoFormSheet: la data è sempre YYYY-MM-DD e
// non merita un parser condiviso per una riga.
function parseIso(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
}

interface MetricEntrySheetProps {
  title: string;
  unit: string;
  onSave: (date: string, value: number) => Promise<void>;
}

/**
 * Foglio "data + valore" riusato da peso e passi in Progress. La data si
 * sceglie (non e' sempre oggi): e' il modo di aggiungere un inserimento
 * passato.
 */
export const MetricEntrySheet = forwardRef<
  BottomSheetModal,
  MetricEntrySheetProps
>(({ title, unit, onSave }, ref) => {
  const { t } = useTranslation();
  const { colors } = useAppTheme();

  const [date, setDate] = useState(() => todayIso());
  const [text, setText] = useState("");
  const [showIosPicker, setShowIosPicker] = useState(false);
  const [tempDate, setTempDate] = useState<Date>(new Date());
  const [saving, setSaving] = useState(false);

  const parsed = Number(text.replace(",", "."));
  const valid = Number.isFinite(parsed) && parsed > 0;

  const dismiss = () => {
    if (typeof ref === "object" && ref?.current) ref.current.dismiss();
  };

  const reset = () => {
    setDate(todayIso());
    setText("");
  };

  const openDatePicker = () => {
    const base = parseIso(date);
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: base,
        mode: "date",
        maximumDate: new Date(),
        onChange: (event, selected) => {
          // Su Android onChange scatta anche all'annullamento (type
          // "dismissed") passando comunque una data: committa solo su "set".
          if (event.type === "set" && selected) setDate(toIsoDate(selected));
        },
      });
    } else {
      setTempDate(base);
      setShowIosPicker(true);
    }
  };

  const save = async () => {
    if (!valid || saving) return;
    setSaving(true);
    try {
      await onSave(date, parsed);
      dismiss();
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <DfBottomSheet ref={ref} title={title} onDismiss={reset}>
        <Text style={[styles.label, { color: colors.text }]}>
          {t("tracking.date_label")}
        </Text>
        <TouchableOpacity
          onPress={openDatePicker}
          activeOpacity={0.6}
          style={[styles.datePickerBtn, { borderColor: colors.border }]}
        >
          <Calendar size={18} color={colors.textSecondary} />
          <Text style={[styles.datePickerText, { color: colors.text }]}>
            {formatDate(date)}
          </Text>
        </TouchableOpacity>

        <View style={styles.row}>
          <TextInput
            value={text}
            onChangeText={(value) => setText(sanitizeDecimalInput(value))}
            keyboardType="decimal-pad"
            placeholderTextColor={colors.textFaint}
            style={[
              styles.input,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                color: colors.text,
              },
            ]}
          />
          <Text style={[styles.unit, { color: colors.textMuted }]}>
            {unit}
          </Text>
        </View>

        <DfButton
          label={t("save")}
          onPress={save}
          disabled={!valid}
          loading={saving}
          style={styles.save}
        />
      </DfBottomSheet>

      {showIosPicker && (
        <Modal
          transparent
          animationType="fade"
          onRequestClose={() => setShowIosPicker(false)}
        >
          <Pressable
            style={styles.iosModalOverlay}
            onPress={() => setShowIosPicker(false)}
          >
            <Pressable
              style={[styles.iosModalContent, { backgroundColor: colors.surface }]}
            >
              <View style={[styles.iosModalHeader, { borderBottomColor: colors.border }]}>
                <Pressable onPress={() => setShowIosPicker(false)}>
                  <Text style={[styles.iosModalCancel, { color: colors.textMuted }]}>
                    {t("cancel")}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setDate(toIsoDate(tempDate));
                    setShowIosPicker(false);
                  }}
                >
                  <Text style={[styles.iosModalConfirm, { color: colors.accent }]}>
                    {t("confirm")}
                  </Text>
                </Pressable>
              </View>
              <DateTimePicker
                value={tempDate}
                mode="date"
                display="spinner"
                locale="it"
                maximumDate={new Date()}
                onChange={(_event, selected) => {
                  if (selected) setTempDate(selected);
                }}
              />
            </Pressable>
          </Pressable>
        </Modal>
      )}
    </>
  );
});

MetricEntrySheet.displayName = "MetricEntrySheet";

const styles = StyleSheet.create({
  label: {
    fontSize: 13,
    fontWeight: "700",
    paddingBottom: theme.spacing.xs,
  },
  datePickerBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    borderWidth: 1,
    borderRadius: theme.radius.lg,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  datePickerText: { fontSize: 15, fontWeight: "500" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  input: {
    flex: 1,
    fontSize: 16,
    borderWidth: 1,
    borderRadius: theme.radius.lg,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: 14,
  },
  unit: {
    fontSize: 16,
    fontWeight: "600",
    minWidth: 56,
  },
  save: { marginTop: theme.spacing.md },
  iosModalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  iosModalContent: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 32,
    alignItems: "center",
  },
  iosModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    alignSelf: "stretch",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iosModalCancel: { fontSize: 16 },
  iosModalConfirm: { fontSize: 16, fontWeight: "600" },
});
