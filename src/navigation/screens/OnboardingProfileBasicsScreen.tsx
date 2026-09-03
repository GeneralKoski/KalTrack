import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import {
  OnboardingShell,
  OnboardingTitle,
} from "@/src/containers/onboarding/OnboardingShell";
import {
  OnboardingLabel,
  OnboardingPicker,
  OnboardingTextField,
} from "@/src/containers/onboarding/OnboardingFields";
import { getProfile, saveProfile } from "@/src/db/queries/settings";
import { toIsoDate } from "@/src/domain/date";
import type { ActivityLevel, Goal, Sex } from "@/src/domain/targets";
import { useAppNav } from "@/src/hooks/useAppNav";
import { useTranslation } from "@/src/hooks/useTranslation";
import { useOnboardingStore } from "@/src/stores/onboardingStore";
import { theme } from "@/src/styles";
import { formatDate } from "@/src/utils/dateUtils";
import DateTimePicker, {
  DateTimePickerAndroid,
} from "@react-native-community/datetimepicker";
import { Calendar } from "lucide-react-native";
import React, { useEffect, useState } from "react";
import { Modal, Platform, Pressable, StyleSheet, TouchableOpacity, View } from "react-native";

const SEXES: Sex[] = ["male", "female"];

// Copia locale come in TargetsScreen: la data e' sempre YYYY-MM-DD e non
// merita un parser condiviso per una riga.
function parseIso(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Secondo passo: sesso, data di nascita, altezza.
 *
 * Carica il profilo intero (non solo questi tre campi) perché `saveProfile`
 * è un upsert su riga unica: se qui si scrivesse solo sesso/data/altezza,
 * attività e obiettivo - non ancora chiesti - verrebbero sovrascritti con i
 * default invece di restare quel che erano.
 */
export function OnboardingProfileBasicsScreen() {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const { navigate, goBack } = useAppNav();
  const advanceTo = useOnboardingStore((s) => s.advanceTo);

  const [loading, setLoading] = useState(true);
  const [sex, setSex] = useState<Sex>("male");
  const [birthdate, setBirthdate] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [activity, setActivity] = useState<ActivityLevel>("moderate");
  const [goal, setGoal] = useState<Goal>("maintain");
  const [showIosDatePicker, setShowIosDatePicker] = useState(false);
  const [tempDate, setTempDate] = useState<Date>(new Date());

  useEffect(() => {
    let active = true;
    (async () => {
      const profile = await getProfile();
      if (!active) return;
      if (profile) {
        if (profile.sex) setSex(profile.sex as Sex);
        setBirthdate(profile.birthdate ?? "");
        setHeightCm(profile.height_cm ? String(profile.height_cm) : "");
        if (profile.activity_level) setActivity(profile.activity_level as ActivityLevel);
        if (profile.goal) setGoal(profile.goal as Goal);
      }
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  const heightValue = Number(heightCm.replace(",", "."));
  const canProceed = birthdate.length === 10 && Number.isFinite(heightValue) && heightValue > 0;

  const openBirthdatePicker = () => {
    const base = birthdate.length === 10 ? parseIso(birthdate) : new Date();
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: base,
        mode: "date",
        maximumDate: new Date(),
        onChange: (event, selected) => {
          if (event.type === "set" && selected) setBirthdate(toIsoDate(selected));
        },
      });
    } else {
      setTempDate(base);
      setShowIosDatePicker(true);
    }
  };

  const goNext = async () => {
    await saveProfile({
      sex,
      birthdate,
      heightCm: heightValue,
      activityLevel: activity,
      goal,
    });
    await advanceTo("OnboardingWeight");
    navigate("OnboardingWeight");
  };

  return (
    <OnboardingShell
      step="OnboardingProfileBasics"
      onBack={goBack}
      primaryLabel={t("onboarding.next")}
      onPrimary={() => void goNext()}
      primaryDisabled={loading || !canProceed}
    >
      <OnboardingTitle>{t("onboarding.profile_basics_title")}</OnboardingTitle>

      <OnboardingPicker
        label={t("targets.sex")}
        title={t("targets.sex")}
        values={SEXES}
        selected={sex}
        labelKey="targets.sex_value"
        onSelect={setSex}
      />

      <OnboardingLabel>{t("targets.birthdate")}</OnboardingLabel>
      <TouchableOpacity
        onPress={openBirthdatePicker}
        activeOpacity={0.6}
        style={[styles.dateBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
      >
        <Calendar size={16} color={colors.textMuted} />
        <Text style={[styles.dateText, { color: birthdate ? colors.text : colors.textFaint }]}>
          {birthdate ? formatDate(birthdate) : t("select_date_placeholder")}
        </Text>
      </TouchableOpacity>

      <OnboardingLabel>{t("targets.height")}</OnboardingLabel>
      <OnboardingTextField value={heightCm} onChangeText={setHeightCm} placeholder="175" />

      {showIosDatePicker && (
        <Modal
          transparent
          animationType="fade"
          onRequestClose={() => setShowIosDatePicker(false)}
        >
          <Pressable style={styles.iosModalOverlay} onPress={() => setShowIosDatePicker(false)}>
            <Pressable style={[styles.iosModalContent, { backgroundColor: colors.surface }]}>
              <View style={[styles.iosModalHeader, { borderBottomColor: colors.border }]}>
                <Pressable onPress={() => setShowIosDatePicker(false)}>
                  <Text style={[styles.iosModalCancel, { color: colors.textMuted }]}>
                    {t("cancel")}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setBirthdate(toIsoDate(tempDate));
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
    </OnboardingShell>
  );
}

const styles = StyleSheet.create({
  dateBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    borderWidth: 1,
    borderRadius: theme.radius.lg,
    paddingHorizontal: theme.spacing.md,
    // md come OnboardingPicker qui sopra: stesso peso per due bottoni-select
    // fianco a fianco.
    paddingVertical: theme.spacing.md,
  },
  dateText: { fontSize: 15 },
  iosModalOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" },
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
