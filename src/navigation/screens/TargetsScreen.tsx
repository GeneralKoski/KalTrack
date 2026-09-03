import { DfBottomSheet } from "@/src/components/DfBottomSheet";
import { FormScreen } from "@/src/components/FormScreen";
import { DfButton } from "@/src/components/form/DfButton";
import { MetalPanel, ScreenBackground, SectionLabel } from "@/src/components/kal";
import { useAppTheme } from "@/src/components/ThemeContext";
import { Text, TextInput } from "@/src/components/ui";
import { getProfile, getTargetsFor, saveProfile, saveTargets } from "@/src/db/queries/settings";
import { latestWeight } from "@/src/db/queries/tracking";
import { todayIso, toIsoDate } from "@/src/domain/date";
import {
  ACTIVITY_FACTORS,
  ageAt,
  bmr,
  suggestTargets,
  tdee,
  type ActivityLevel,
  type Goal,
  type Sex,
} from "@/src/domain/targets";
import { useAppNav } from "@/src/hooks/useAppNav";
import { useTranslation } from "@/src/hooks/useTranslation";
import { theme } from "@/src/styles";
import { formatDate } from "@/src/utils/dateUtils";
import { showToast } from "@/src/utils/toast";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import DateTimePicker, {
  DateTimePickerAndroid,
} from "@react-native-community/datetimepicker";
import { Calendar, Check, ChevronDown, ChevronLeft } from "lucide-react-native";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type PickerKind = "sex" | "activity" | "goal";

// Copia locale come in ProgressPhotoFormSheet: la data è sempre YYYY-MM-DD e
// non merita un parser condiviso per una riga.
function parseIso(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
}

const SEXES: Sex[] = ["male", "female"];
const ACTIVITIES = Object.keys(ACTIVITY_FACTORS) as ActivityLevel[];
const GOALS: Goal[] = ["cut", "maintain", "bulk"];

const num = (text: string): number => {
  const parsed = Number(text.replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
};

export function TargetsScreen() {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const { goBack } = useAppNav();
  const today = todayIso();

  const [loading, setLoading] = useState(true);
  const [sex, setSex] = useState<Sex>("male");
  const [birthdate, setBirthdate] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [activity, setActivity] = useState<ActivityLevel>("moderate");
  const [goal, setGoal] = useState<Goal>("maintain");
  const [pickerKind, setPickerKind] = useState<PickerKind | null>(null);
  const pickerSheetRef = useRef<BottomSheetModal>(null);

  const [kcal, setKcal] = useState("");
  const [proteinG, setProteinG] = useState("");
  const [carbsG, setCarbsG] = useState("");
  const [fatG, setFatG] = useState("");
  const [steps, setSteps] = useState("");
  const [weightKg, setWeightKg] = useState<number | null>(null);
  const [showIosDatePicker, setShowIosDatePicker] = useState(false);
  const [tempDate, setTempDate] = useState<Date>(new Date());

  useEffect(() => {
    let active = true;
    (async () => {
      const [profile, targets, weight] = await Promise.all([
        getProfile(),
        getTargetsFor(today),
        latestWeight(),
      ]);
      if (!active) return;

      if (profile) {
        if (profile.sex) setSex(profile.sex as Sex);
        setBirthdate(profile.birthdate ?? "");
        setHeightCm(profile.height_cm ? String(profile.height_cm) : "");
        if (profile.activity_level) setActivity(profile.activity_level as ActivityLevel);
        if (profile.goal) setGoal(profile.goal as Goal);
      }
      if (targets) {
        setKcal(String(Math.round(targets.kcal)));
        setProteinG(String(Math.round(targets.protein_g)));
        setCarbsG(String(Math.round(targets.carbs_g)));
        setFatG(String(Math.round(targets.fat_g)));
        setSteps(String(targets.steps));
      }
      setWeightKg(weight?.weight_kg ?? null);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [today]);

  const canCompute =
    birthdate.length === 10 && num(heightCm) > 0 && weightKg !== null;

  const age = canCompute ? ageAt(birthdate, new Date()) : null;
  const basal =
    canCompute && age !== null
      ? bmr({ sex, weightKg: weightKg!, heightCm: num(heightCm), age })
      : null;
  const daily = basal !== null ? tdee(basal, activity) : null;

  const openBirthdatePicker = () => {
    const base = birthdate.length === 10 ? parseIso(birthdate) : new Date();
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: base,
        mode: "date",
        maximumDate: new Date(),
        onChange: (event, selected) => {
          // Su Android onChange scatta anche all'annullamento (type
          // "dismissed") passando comunque una data: committa solo su "set".
          if (event.type === "set" && selected) setBirthdate(toIsoDate(selected));
        },
      });
    } else {
      setTempDate(base);
      setShowIosDatePicker(true);
    }
  };

  const compute = () => {
    if (weightKg === null) {
      showToast.error({ title: t("targets.missing_weight") });
      return;
    }
    if (!canCompute || age === null) {
      showToast.error({ title: t("targets.cannot_compute") });
      return;
    }
    const suggestion = suggestTargets({
      sex,
      weightKg: weightKg!,
      // Qui l'altezza c'e' per forza: canCompute lo ha gia' verificato.
      heightCm: num(heightCm),
      age,
      activity,
      goal,
    });
    setKcal(String(suggestion.kcal));
    setProteinG(String(suggestion.proteinG));
    setCarbsG(String(suggestion.carbsG));
    setFatG(String(suggestion.fatG));
  };

  const save = async () => {
    if (num(kcal) <= 0) {
      showToast.error({ title: t("targets.kcal_required") });
      return;
    }
    await saveProfile({
      sex,
      birthdate,
      // Campo vuoto: nessuna altezza, non zero centimetri.
      heightCm: heightCm.trim() === "" ? null : num(heightCm),
      activityLevel: activity,
      goal,
    });
    // Nuova decorrenza da oggi: gli obiettivi passati restano dov'erano.
    await saveTargets({
      validFrom: today,
      kcal: num(kcal),
      proteinG: num(proteinG),
      carbsG: num(carbsG),
      fatG: num(fatG),
      steps: num(steps),
    });
    showToast.success({ title: t("targets.saved") });
    goBack();
  };

  const input = (
    value: string,
    onChangeText: (v: string) => void,
    numeric = true,
    placeholder?: string,
  ) => (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      keyboardType={numeric ? "decimal-pad" : "default"}
      placeholder={placeholder}
      placeholderTextColor={colors.textFaint}
      style={[
        styles.input,
        { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text },
      ]}
    />
  );

  const pickerFor = (kind: PickerKind) => {
    if (kind === "sex")
      return {
        title: t("targets.sex"),
        values: SEXES as readonly string[],
        selected: sex,
        labelKey: "targets.sex_value",
        onSelect: (v: string) => setSex(v as Sex),
      };
    if (kind === "activity")
      return {
        title: t("targets.activity"),
        values: ACTIVITIES as readonly string[],
        selected: activity,
        labelKey: "targets.activity_value",
        onSelect: (v: string) => setActivity(v as ActivityLevel),
      };
    return {
      title: t("targets.goal"),
      values: GOALS as readonly string[],
      selected: goal,
      labelKey: "targets.goal_value",
      onSelect: (v: string) => setGoal(v as Goal),
    };
  };

  const activePicker = pickerKind ? pickerFor(pickerKind) : null;

  const openPicker = (kind: PickerKind) => {
    setPickerKind(kind);
    pickerSheetRef.current?.present();
  };

  const selectField = (kind: PickerKind, currentValue: string, labelKey: string) => (
    <TouchableOpacity
      onPress={() => openPicker(kind)}
      activeOpacity={0.6}
      style={[styles.selectBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      <Text style={[styles.selectBtnText, { color: colors.text }]}>
        {t(`${labelKey}.${currentValue}`)}
      </Text>
      <ChevronDown size={18} color={colors.textMuted} />
    </TouchableOpacity>
  );

  return (
    <View style={styles.root}>
      <ScreenBackground />
      <SafeAreaView edges={["top", "left", "right"]} style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity onPress={goBack} activeOpacity={0.6} hitSlop={10}>
            <ChevronLeft size={26} color={colors.textSecondary} />
          </TouchableOpacity>
          <Text
            style={[styles.title, { color: colors.text }]}
            numberOfLines={1}
          >
            {t("targets.title")}
          </Text>
        </View>

        {loading ? (
          <ActivityIndicator style={styles.loader} color={colors.accent} />
        ) : (
          <FormScreen contentContainerStyle={styles.content} bottomSpacing={theme.spacing.lg}>
            <Text style={[styles.label, { color: colors.textMuted }]}>
              {t("targets.sex")}
            </Text>
            {selectField("sex", sex, "targets.sex_value")}

            <View style={styles.row}>
              <View style={styles.col}>
                <Text style={[styles.label, { color: colors.textMuted }]}>
                  {t("targets.birthdate")}
                </Text>
                <TouchableOpacity
                  onPress={openBirthdatePicker}
                  activeOpacity={0.6}
                  style={[
                    styles.datePickerBtn,
                    { backgroundColor: colors.surface, borderColor: colors.border },
                  ]}
                >
                  <Calendar size={16} color={colors.textMuted} />
                  <Text
                    style={[
                      styles.datePickerText,
                      { color: birthdate ? colors.text : colors.textFaint },
                    ]}
                  >
                    {birthdate ? formatDate(birthdate) : t("select_date_placeholder")}
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.col}>
                <Text style={[styles.label, { color: colors.textMuted }]}>
                  {t("targets.height")}
                </Text>
                {input(heightCm, setHeightCm, true, "175")}
              </View>
            </View>

            <Text style={[styles.label, { color: colors.textMuted }]}>
              {t("targets.activity")}
            </Text>
            {selectField("activity", activity, "targets.activity_value")}

            <Text style={[styles.label, { color: colors.textMuted }]}>
              {t("targets.goal")}
            </Text>
            {selectField("goal", goal, "targets.goal_value")}

            <SectionLabel style={styles.section}>
              {t("targets.daily")}
            </SectionLabel>

            {/* Il numero suggerito va spiegato, non calato dall'alto. */}
            {basal !== null && daily !== null && (
              <MetalPanel radius={theme.radius.xl} style={styles.explain}>
                <View style={styles.explainInner}>
                  <Text style={[styles.explainText, { color: colors.textSecondary }]}>
                    {t("targets.explain", {
                      bmr: Math.round(basal),
                      tdee: Math.round(daily),
                      weight: weightKg,
                    })}
                  </Text>
                </View>
              </MetalPanel>
            )}

            <DfButton
              label={t("targets.compute")}
              variant="outlined"
              onPress={compute}
              style={styles.compute}
            />

            <Text style={[styles.label, { color: colors.textMuted }]}>
              {t("targets.kcal")}
            </Text>
            {input(kcal, setKcal)}

            <View style={styles.macros}>
              <View style={styles.macro}>
                <Text style={[styles.label, { color: colors.textMuted }]}>
                  {t("diary.protein_short")}
                </Text>
                {input(proteinG, setProteinG)}
              </View>
              <View style={styles.macro}>
                <Text style={[styles.label, { color: colors.textMuted }]}>
                  {t("diary.carbs_short")}
                </Text>
                {input(carbsG, setCarbsG)}
              </View>
              <View style={styles.macro}>
                <Text style={[styles.label, { color: colors.textMuted }]}>
                  {t("diary.fat_short")}
                </Text>
                {input(fatG, setFatG)}
              </View>
            </View>

            <Text style={[styles.label, { color: colors.textMuted }]}>
              {t("targets.steps")}
            </Text>
            {input(steps, setSteps)}

            <DfButton label={t("save")} onPress={save} style={styles.save} />
          </FormScreen>
        )}
      </SafeAreaView>

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

      <DfBottomSheet ref={pickerSheetRef} title={activePicker?.title}>
        {activePicker?.values.map((value) => {
          const isSelected = value === activePicker.selected;
          return (
            <TouchableOpacity
              key={value}
              activeOpacity={0.6}
              style={styles.pickerRow}
              onPress={() => {
                activePicker.onSelect(value);
                pickerSheetRef.current?.dismiss();
              }}
            >
              <Text style={[styles.pickerRowText, { color: colors.text }]}>
                {t(`${activePicker.labelKey}.${value}`)}
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
  root: { flex: 1 },
  safe: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  title: { flex: 1, fontSize: 18, fontWeight: "700" },
  content: { flexGrow: 1, padding: theme.spacing.md },
  label: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.xs,
  },
  input: {
    borderWidth: 1,
    borderRadius: theme.radius.lg,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    fontSize: 15,
  },
  row: { flexDirection: "row", gap: theme.spacing.sm },
  col: { flex: 1 },
  datePickerBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    borderWidth: 1,
    borderRadius: theme.radius.lg,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  datePickerText: { fontSize: 15 },
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
  selectBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderRadius: theme.radius.lg,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  selectBtnText: { fontSize: 15 },
  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: theme.spacing.md,
  },
  pickerRowText: { fontSize: 15, fontWeight: "500" },
  section: { marginTop: theme.spacing.lg },
  explain: { marginTop: theme.spacing.sm },
  explainInner: { padding: theme.spacing.md },
  explainText: { fontSize: 13, lineHeight: 19 },
  compute: { marginTop: theme.spacing.sm },
  macros: { flexDirection: "row", gap: theme.spacing.sm },
  macro: { flex: 1 },
  save: { marginTop: theme.spacing.lg },
  loader: { marginTop: theme.spacing.xl },
});
