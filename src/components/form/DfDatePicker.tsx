import { useTranslation } from "@/src/hooks/useTranslation";
import { theme } from "@/src/styles";
import DateTimePicker, {
  DateTimePickerAndroid,
} from "@react-native-community/datetimepicker";
import { Calendar } from "lucide-react-native";
import React, { useState } from "react";
import {
  Controller,
  useFormContext,
  type FieldError,
  type RegisterOptions,
} from "react-hook-form";
import {
  Keyboard,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  TextStyle,
  View,
} from "react-native";

import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import { formatDate } from "@/src/utils/dateUtils";
import { useFieldRegistration } from "./FormScrollContext";

interface DatePickerProps {
  name: string;
  label?: string;
  placeholder?: string;
  iconPosition?: "left" | "right";
  style?: {
    label?: TextStyle;
    picker?: TextStyle;
    pickerText?: TextStyle;
  };
  rules?: RegisterOptions;
}

export const DfDatePicker = ({
  name,
  label,
  style,
  placeholder,
  rules,
  iconPosition = "right",
}: DatePickerProps) => {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const { control, clearErrors } = useFormContext();
  const fieldRef = useFieldRegistration(name);

  const [showIosPicker, setShowIosPicker] = useState(false);
  const [tempDate, setTempDate] = useState<Date>(new Date());

  const webInput = ({
    value,
    onChange,
    error,
  }: {
    value: Date | string;
    onChange: (value: Date | string) => void;
    error: FieldError | undefined;
  }) => {
    return (
      <>
        <View
          style={[
            styles.picker,
            { backgroundColor: colors.surface, borderColor: colors.border },
            style?.picker,
            error && styles.inputError,
          ]}
        >
          <input
            type="date"
            value={
              value && !isNaN(new Date(value).getTime())
                ? new Date(value).toISOString().split("T")[0]
                : ""
            }
            onChange={(e) => {
              const raw = e.target.value;
              if (!raw) {
                onChange("");
                return;
              }
              const date = new Date(raw);
              if (!isNaN(date.getTime())) {
                onChange(date);
              }
            }}
            onFocus={() => clearErrors(name)}
            style={{
              border: "none",
              outline: "none",
              fontSize: 16,
              color: colors.text,
              backgroundColor: "transparent",
              flex: 1,
              fontFamily: theme.fonts.regular,
            }}
            placeholder={placeholder}
          />
        </View>
        {error && (
          <Text style={styles.errorText}>{error.message?.toString()}</Text>
        )}
      </>
    );
  };

  const openAndroidPicker = (
    value: Date | string,
    onChange: (value: Date | string) => void,
  ) => {
    Keyboard.dismiss();
    clearErrors(name);
    DateTimePickerAndroid.open({
      value: value ? new Date(value) : new Date(),
      mode: "date",
      onChange: (_event, selectedDate) => {
        if (selectedDate) {
          onChange(selectedDate);
        }
      },
    });
  };

  const mobileInput = ({
    value,
    onChange,
    error,
  }: {
    value: Date | string;
    onChange: (value: Date | string) => void;
    error: FieldError | undefined;
  }) => {
    const isIos = Platform.OS === "ios";

    return (
      <>
        <Pressable
          style={[
            styles.picker,
            { backgroundColor: colors.surface, borderColor: colors.border },
            style?.picker,
            error && styles.inputError,
          ]}
          onPress={() => {
            if (isIos) {
              Keyboard.dismiss();
              clearErrors(name);
              setTempDate(value ? new Date(value) : new Date());
              setShowIosPicker(true);
            } else {
              openAndroidPicker(value, onChange);
            }
          }}
        >
          {iconPosition === "left" && (
            <Calendar
              size={20}
              color={colors.textMuted}
              style={{ marginRight: 8 }}
            />
          )}
          <Text
            style={[
              styles.pickerText,
              { color: colors.text },
              style?.pickerText,
              iconPosition === "left" && { flex: 1 },
            ]}
          >
            {value ? (
              formatDate(value)
            ) : (
              <Text style={{ color: colors.textFaint }}>
                {t("select_date_placeholder")}
              </Text>
            )}
          </Text>
          {iconPosition === "right" && (
            <Calendar size={20} color={colors.textMuted} />
          )}
        </Pressable>
        {isIos && (
          <Modal
            visible={showIosPicker}
            transparent
            animationType="fade"
            onRequestClose={() => setShowIosPicker(false)}
          >
            <Pressable
              style={styles.modalOverlay}
              onPress={() => setShowIosPicker(false)}
            >
              <Pressable
                style={[
                  styles.modalContent,
                  { backgroundColor: colors.surface },
                ]}
              >
                <View
                  style={[
                    styles.modalHeader,
                    { borderBottomColor: colors.border },
                  ]}
                >
                  <Pressable onPress={() => setShowIosPicker(false)}>
                    <Text
                      style={[styles.modalCancel, { color: colors.textMuted }]}
                    >
                      {t("cancel")}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      onChange(tempDate);
                      setShowIosPicker(false);
                    }}
                  >
                    <Text style={styles.modalConfirm}>{t("confirm")}</Text>
                  </Pressable>
                </View>
                <DateTimePicker
                  value={tempDate}
                  mode="date"
                  display="spinner"
                  locale="it"
                  onChange={(_event, selectedDate) => {
                    if (selectedDate) {
                      setTempDate(selectedDate);
                    }
                  }}
                />
              </Pressable>
            </Pressable>
          </Modal>
        )}
        {error && (
          <Text style={styles.errorText}>{error.message?.toString()}</Text>
        )}
      </>
    );
  };

  return (
    <Controller
      control={control}
      name={name}
      rules={rules}
      render={({ field: { onChange, value }, fieldState: { error } }) => (
        <View ref={fieldRef} style={styles.wrapper}>
          {label && (
            <Text style={[styles.label, { color: colors.text }, style?.label]}>
              {label}
            </Text>
          )}
          {(Platform.OS === "web" ? webInput : mobileInput)({
            value,
            onChange,
            error,
          })}
        </View>
      )}
    />
  );
};

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: theme.spacing.md,
  },
  label: {
    fontWeight: "500",
    fontSize: 14,
    marginBottom: 6,
  },
  picker: {
    borderWidth: 1,
    borderRadius: theme.radius.md,
    paddingVertical: 12,
    paddingHorizontal: 14,
    minHeight: 48,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  pickerText: {
    fontSize: 16,
  },
  inputError: {
    borderColor: theme.colors.error,
  },
  errorText: {
    fontSize: 12,
    color: theme.colors.error,
    marginTop: 4,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  modalContent: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 32,
    alignItems: "center",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    alignSelf: "stretch",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalCancel: {
    fontSize: 16,
  },
  modalConfirm: {
    fontSize: 16,
    fontWeight: "600",
    color: theme.colors.primary,
  },
});
