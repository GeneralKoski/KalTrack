import { useAppTheme } from "@/src/components/ThemeContext";
import { ScreenBackground, SectionLabel } from "@/src/components/kal";
import { Text } from "@/src/components/ui";
import { AssistantSettings } from "@/src/containers/settings/AssistantSettings";
import { HealthConnectSettings } from "@/src/containers/settings/HealthConnectSettings";
import { ThemePicker } from "@/src/containers/settings/ThemePicker";
import { useAppNav } from "@/src/hooks/useAppNav";
import { useTranslation } from "@/src/hooks/useTranslation";
import { theme } from "@/src/styles";
import { ChevronLeft } from "lucide-react-native";
import React from "react";
import { ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export function SettingsScreen() {
  const { t } = useTranslation();
  const { goBack } = useAppNav();
  const { colors } = useAppTheme();

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
            {t("settings.title")}
          </Text>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          <SectionLabel>{t("settings.theme")}</SectionLabel>
          <ThemePicker />

          <SectionLabel style={styles.section}>
            {t("settings.assistant")}
          </SectionLabel>
          <AssistantSettings />

          <SectionLabel style={styles.section}>
            {t("settings.health")}
          </SectionLabel>
          <HealthConnectSettings />
        </ScrollView>
      </SafeAreaView>
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
  title: {
    flex: 1,
    fontSize: 18,
    fontWeight: "700",
  },
  content: {
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  section: {
    marginTop: theme.spacing.md,
  },
});
