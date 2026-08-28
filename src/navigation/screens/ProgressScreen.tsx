import { ScreenBackground } from "@/src/components/kal";
import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import { useTranslation } from "@/src/hooks/useTranslation";
import { theme } from "@/src/styles";
import React from "react";
import { StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export function ProgressScreen() {
  const { t } = useTranslation();
  const { colors } = useAppTheme();

  return (
    <View style={styles.root}>
      <ScreenBackground />
      <SafeAreaView edges={["top", "left", "right"]} style={styles.safe}>
        <Text style={[styles.title, { color: colors.text }]}>
          {t("tabs.progress")}
        </Text>
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
    alignItems: "center",
    justifyContent: "center",
    padding: theme.spacing.md,
  },
  title: {
    fontSize: 20,
    fontWeight: "600",
  },
});
