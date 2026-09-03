import { DfBottomSheet } from "@/src/components/DfBottomSheet";
import { DfButton } from "@/src/components/form/DfButton";
import { Chip, PhotoField } from "@/src/components/kal";
import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import { addProgressPhoto } from "@/src/db/queries/wellbeing";
import { todayIso, toIsoDate } from "@/src/domain/date";
import { useTranslation } from "@/src/hooks/useTranslation";
import { theme } from "@/src/styles";
import { PHOTO_POSES } from "@/src/types/wellbeing";
import { formatDate } from "@/src/utils/dateUtils";
import { logger } from "@/src/utils/logger";
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
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";

// Copia locale come in MealPlanScreen: la data è sempre YYYY-MM-DD e non
// merita un parser condiviso per una riga.
function parseIso(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
}

interface ProgressPhotoFormSheetProps {
  /** Chiamato dopo il salvataggio, per ricaricare l'elenco. */
  onSaved: () => void;
}

/**
 * Il foglio aperto dal "+" di Foto progressi. Data e foto insieme: si vuole
 * anche caricare una foto vecchia, e in quel caso la data non è oggi.
 */
export const ProgressPhotoFormSheet = forwardRef<
  BottomSheetModal,
  ProgressPhotoFormSheetProps
>(({ onSaved }, ref) => {
  const { t } = useTranslation();
  const { colors } = useAppTheme();

  const [pendingUri, setPendingUri] = useState<string | null>(null);
  const [pose, setPose] = useState<string | null>(null);
  const [photoDate, setPhotoDate] = useState(() => todayIso());
  const [showIosDatePicker, setShowIosDatePicker] = useState(false);
  const [tempDate, setTempDate] = useState<Date>(new Date());
  const [saving, setSaving] = useState(false);

  const poseLabel = (value: string) =>
    t(`progress_photos.poses.${value}`, { defaultValue: value });

  const dismiss = () => {
    if (typeof ref === "object" && ref?.current) ref.current.dismiss();
  };

  const reset = () => {
    setPendingUri(null);
    setPose(null);
    setPhotoDate(todayIso());
  };

  const openDatePicker = () => {
    const base = parseIso(photoDate);
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: base,
        mode: "date",
        maximumDate: new Date(),
        onChange: (event, selected) => {
          // Su Android onChange scatta anche all'annullamento (type
          // "dismissed") passando comunque una data: committa solo su "set".
          if (event.type === "set" && selected) setPhotoDate(toIsoDate(selected));
        },
      });
    } else {
      setTempDate(base);
      setShowIosDatePicker(true);
    }
  };

  const save = async () => {
    if (!pendingUri || saving) return;
    setSaving(true);
    try {
      await addProgressPhoto(photoDate, pendingUri, pose);
      onSaved();
      dismiss();
    } catch (error) {
      logger.error("[ProgressPhotoFormSheet] salvataggio foto fallito", error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <DfBottomSheet
        ref={ref}
        title={t("progress_photos.add")}
        onDismiss={reset}
      >
        <PhotoField uri={pendingUri} onChange={setPendingUri} prefix="progress" />

        <Text style={[styles.label, { color: colors.text }]}>
          {t("progress_photos.date_label")}
        </Text>
        <TouchableOpacity
          onPress={openDatePicker}
          activeOpacity={0.6}
          style={[styles.datePickerBtn, { borderColor: colors.border }]}
        >
          <Calendar size={18} color={colors.textSecondary} />
          <Text style={[styles.datePickerText, { color: colors.text }]}>
            {formatDate(photoDate)}
          </Text>
        </TouchableOpacity>

        <Text style={[styles.label, { color: colors.text }]}>
          {t("progress_photos.pose_label")}
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.poses}
        >
          {PHOTO_POSES.map((value) => (
            <Chip
              key={value}
              label={poseLabel(value)}
              active={value === pose}
              // Ritoccare la posa scelta la toglie: la posa è facoltativa.
              onPress={() => setPose(pose === value ? null : value)}
            />
          ))}
        </ScrollView>

        <DfButton
          label={t("progress_photos.save")}
          onPress={save}
          loading={saving}
          disabled={!pendingUri}
          style={styles.save}
        />
      </DfBottomSheet>

      {showIosDatePicker && (
        <Modal
          transparent
          animationType="fade"
          onRequestClose={() => setShowIosDatePicker(false)}
        >
          <Pressable
            style={styles.iosModalOverlay}
            onPress={() => setShowIosDatePicker(false)}
          >
            <Pressable
              style={[styles.iosModalContent, { backgroundColor: colors.surface }]}
            >
              <View style={[styles.iosModalHeader, { borderBottomColor: colors.border }]}>
                <Pressable onPress={() => setShowIosDatePicker(false)}>
                  <Text style={[styles.iosModalCancel, { color: colors.textMuted }]}>
                    {t("cancel")}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setPhotoDate(toIsoDate(tempDate));
                    setShowIosDatePicker(false);
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

ProgressPhotoFormSheet.displayName = "ProgressPhotoFormSheet";

const styles = StyleSheet.create({
  label: {
    fontSize: 13,
    fontWeight: "700",
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.xs,
  },
  datePickerBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    borderWidth: 1,
    borderRadius: theme.radius.lg,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 12,
  },
  datePickerText: { fontSize: 15, fontWeight: "500" },
  poses: {
    alignItems: "center",
    gap: theme.spacing.sm,
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
