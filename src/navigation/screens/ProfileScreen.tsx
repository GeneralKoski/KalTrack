import { ASSISTANT_FAB_CLEARANCE } from "@/src/containers/assistant/AssistantButton";
import { Card, ScreenBackground } from "@/src/components/kal";
import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import { useAppNav } from "@/src/hooks/useAppNav";
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
  Ruler,
  Salad,
  Settings,
  Target,
  Timer,
  Trophy,
} from "lucide-react-native";
import React from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

export function ProfileScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { navigate } = useAppNav();
  const { colors } = useAppTheme();

  return (
    <View style={styles.root}>
      <ScreenBackground />
      <SafeAreaView edges={["top", "left", "right"]} style={styles.safe}>
        <Text style={[styles.title, { color: colors.text }]}>
          {t("tabs.profile")}
        </Text>

        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + ASSISTANT_FAB_CLEARANCE },
          ]}
        >
          <Card onPress={() => navigate("Targets")} style={styles.row}>
            <Target size={22} color={colors.text} />
            <Text
              style={[styles.rowLabel, { color: colors.text }]}
              numberOfLines={1}
            >
              {t("profile.targets")}
            </Text>
            <ChevronRight size={20} color={colors.textFaint} />
          </Card>

          <Card onPress={() => navigate("Foods")} style={styles.row}>
            <Salad size={22} color={colors.text} />
            <Text
              style={[styles.rowLabel, { color: colors.text }]}
              numberOfLines={1}
            >
              {t("profile.my_foods")}
            </Text>
            <ChevronRight size={20} color={colors.textFaint} />
          </Card>

          <Card onPress={() => navigate("Recipes")} style={styles.row}>
            <CookingPot size={22} color={colors.text} />
            <Text
              style={[styles.rowLabel, { color: colors.text }]}
              numberOfLines={1}
            >
              {t("profile.my_recipes")}
            </Text>
            <ChevronRight size={20} color={colors.textFaint} />
          </Card>

          <Card onPress={() => navigate("Routines")} style={styles.row}>
            <Dumbbell size={22} color={colors.text} />
            <Text style={[styles.rowLabel, { color: colors.text }]}>
              {t("gym.routines")}
            </Text>
            <ChevronRight size={20} color={colors.textFaint} />
          </Card>

          <Card onPress={() => navigate("Achievements")} style={styles.row}>
            <Trophy size={22} color={colors.text} />
            <Text style={[styles.rowLabel, { color: colors.text }]}>
              {t("profile.achievements")}
            </Text>
            <ChevronRight size={20} color={colors.textFaint} />
          </Card>

          <Card onPress={() => navigate("MealPlan")} style={styles.row}>
            <CalendarRange size={22} color={colors.text} />
            <Text style={[styles.rowLabel, { color: colors.text }]}>
              {t("profile.meal_plan")}
            </Text>
            <ChevronRight size={20} color={colors.textFaint} />
          </Card>

          <Card onPress={() => navigate("Fasting")} style={styles.row}>
            <Timer size={22} color={colors.text} />
            <Text style={[styles.rowLabel, { color: colors.text }]}>
              {t("profile.fasting")}
            </Text>
            <ChevronRight size={20} color={colors.textFaint} />
          </Card>

          <Card onPress={() => navigate("Measurements")} style={styles.row}>
            <Ruler size={22} color={colors.text} />
            <Text style={[styles.rowLabel, { color: colors.text }]}>
              {t("profile.measurements")}
            </Text>
            <ChevronRight size={20} color={colors.textFaint} />
          </Card>

          <Card onPress={() => navigate("ProgressPhotos")} style={styles.row}>
            <Camera size={22} color={colors.text} />
            <Text style={[styles.rowLabel, { color: colors.text }]}>
              {t("profile.progress_photos")}
            </Text>
            <ChevronRight size={20} color={colors.textFaint} />
          </Card>

          <Card onPress={() => navigate("Reminders")} style={styles.row}>
            <Bell size={22} color={colors.text} />
            <Text style={[styles.rowLabel, { color: colors.text }]}>
              {t("profile.reminders")}
            </Text>
            <ChevronRight size={20} color={colors.textFaint} />
          </Card>

          <Card onPress={() => navigate("Backup")} style={styles.row}>
            <DatabaseBackup size={22} color={colors.text} />
            <Text
              style={[styles.rowLabel, { color: colors.text }]}
              numberOfLines={1}
            >
              {t("profile.backup")}
            </Text>
            <ChevronRight size={20} color={colors.textFaint} />
          </Card>

          <Card onPress={() => navigate("Settings")} style={styles.row}>
            <Settings size={22} color={colors.text} />
            <Text
              style={[styles.rowLabel, { color: colors.text }]}
              numberOfLines={1}
            >
              {t("profile.settings")}
            </Text>
            <ChevronRight size={20} color={colors.textFaint} />
          </Card>
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
  title: {
    fontSize: 24,
    fontWeight: "700",
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm,
  },
  content: {
    padding: theme.spacing.md,
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
