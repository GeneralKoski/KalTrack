import { Card, ScreenBackground } from "@/src/components/kal";
import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import { useAppNav } from "@/src/hooks/useAppNav";
import { useTranslation } from "@/src/hooks/useTranslation";
import { theme } from "@/src/styles";
import { ChevronRight, CookingPot, Salad, Settings } from "lucide-react-native";
import React from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export function ProfileScreen() {
  const { t } = useTranslation();
  const { navigate } = useAppNav();
  const { colors } = useAppTheme();

  return (
    <View style={styles.root}>
      <ScreenBackground />
      <SafeAreaView edges={["top", "left", "right"]} style={styles.safe}>
        <Text style={[styles.title, { color: colors.text }]}>
          {t("tabs.profile")}
        </Text>

        <ScrollView contentContainerStyle={styles.content}>
          <Card onPress={() => navigate("Foods")} style={styles.row}>
            <Salad size={22} color={colors.text} />
            <Text style={[styles.rowLabel, { color: colors.text }]}>
              {t("profile.my_foods")}
            </Text>
            <ChevronRight size={20} color={colors.textFaint} />
          </Card>

          <Card onPress={() => navigate("Recipes")} style={styles.row}>
            <CookingPot size={22} color={colors.text} />
            <Text style={[styles.rowLabel, { color: colors.text }]}>
              {t("profile.my_recipes")}
            </Text>
            <ChevronRight size={20} color={colors.textFaint} />
          </Card>

          <Card onPress={() => navigate("Settings")} style={styles.row}>
            <Settings size={22} color={colors.text} />
            <Text style={[styles.rowLabel, { color: colors.text }]}>
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
