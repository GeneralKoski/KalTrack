import { Card, ScreenBackground, SectionLabel } from "@/src/components/kal";
import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import { ProfileSummary } from "@/src/containers/profile/ProfileSummary";
import { useAppNav, type NavParams } from "@/src/hooks/useAppNav";
import { useTranslation } from "@/src/hooks/useTranslation";
import { theme } from "@/src/styles";
import {
  Bell,
  Camera,
  CalendarRange,
  ChevronRight,
  CookingPot,
  DatabaseBackup,
  Dumbbell,
  ListChecks,
  Ruler,
  Salad,
  Settings,
  Target,
  Timer,
  Trophy,
  Users,
} from "lucide-react-native";
import React from "react";
import { ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

type Icon = React.ComponentType<{ size?: number; color?: string }>;

interface Voice {
  route: keyof NavParams;
  labelKey: string;
  icon: Icon;
}

interface Group {
  titleKey: string;
  voices: Voice[];
}

/**
 * Le voci raggruppate per quello che si sta per fare.
 *
 * Erano tredici righe identiche una sotto l'altra, e trovarci "Misure" voleva
 * dire leggerle tutte: righe tutte uguali non si scorrono, si scandagliano.
 * I gruppi non tolgono niente e non aggiungono un tocco - danno un punto in cui
 * fermare l'occhio.
 *
 * Le impostazioni non stanno qui: sono dietro l'ingranaggio in alto, perché non
 * sono una cosa che si fa ma il posto in cui si cambia come l'app si comporta.
 */
const GROUPS: Group[] = [
  {
    titleKey: "profile.group_food",
    voices: [
      { route: "Targets", labelKey: "profile.targets", icon: Target },
      { route: "Foods", labelKey: "profile.my_foods", icon: Salad },
      { route: "Recipes", labelKey: "profile.my_recipes", icon: CookingPot },
      { route: "MealPlan", labelKey: "profile.meal_plan", icon: CalendarRange },
      { route: "Fasting", labelKey: "profile.fasting", icon: Timer },
    ],
  },
  {
    titleKey: "profile.group_gym",
    voices: [
      { route: "Routines", labelKey: "gym.routines", icon: Dumbbell },
      { route: "Exercises", labelKey: "profile.exercises", icon: ListChecks },
    ],
  },
  {
    titleKey: "profile.group_progress",
    voices: [
      { route: "Measurements", labelKey: "profile.measurements", icon: Ruler },
      {
        route: "ProgressPhotos",
        labelKey: "profile.progress_photos",
        icon: Camera,
      },
      { route: "Achievements", labelKey: "profile.achievements", icon: Trophy },
    ],
  },
  {
    titleKey: "profile.group_app",
    voices: [
      { route: "Friends", labelKey: "social.title", icon: Users },
      { route: "Reminders", labelKey: "profile.reminders", icon: Bell },
      { route: "Backup", labelKey: "profile.backup", icon: DatabaseBackup },
    ],
  },
];

export function ProfileScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { navigate } = useAppNav();
  const { colors } = useAppTheme();

  return (
    <View style={styles.root}>
      <ScreenBackground />
      <SafeAreaView edges={["top", "left", "right"]} style={styles.safe}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
            {t("tabs.profile")}
          </Text>
          <TouchableOpacity
            onPress={() => navigate("Settings")}
            activeOpacity={0.6}
            hitSlop={10}
            accessibilityLabel={t("profile.settings")}
          >
            <Settings size={24} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + theme.spacing.lg },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <ProfileSummary />

          {GROUPS.map((group) => (
            <View key={group.titleKey} style={styles.group}>
              <SectionLabel>{t(group.titleKey)}</SectionLabel>
              {group.voices.map(({ route, labelKey, icon: IconTag }) => (
                <Card
                  key={route}
                  onPress={() => navigate(route)}
                  style={styles.row}
                >
                  <IconTag size={22} color={colors.text} />
                  <Text
                    style={[styles.rowLabel, { color: colors.text }]}
                    numberOfLines={1}
                  >
                    {t(labelKey)}
                  </Text>
                  <ChevronRight size={20} color={colors.textFaint} />
                </Card>
              ))}
            </View>
          ))}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  safe: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm,
  },
  title: {
    flex: 1,
    fontSize: 24,
    fontWeight: "700",
  },
  content: {
    padding: theme.spacing.md,
    gap: theme.spacing.md,
  },
  group: {
    gap: theme.spacing.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
  },
  rowLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
  },
});
