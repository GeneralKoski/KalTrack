import { ScreenBackground } from "@/src/components/kal";
import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import { useAppNav } from "@/src/hooks/useAppNav";
import { theme } from "@/src/styles";
import { ChevronLeft } from "lucide-react-native";
import React from "react";
import { ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

/**
 * L'involucro di una pagina di impostazioni: sfondo, indietro, titolo, elenco.
 *
 * Le impostazioni sono un elenco di righe che portano dentro, e ogni dentro ha
 * la stessa intestazione: tenerla in un posto solo evita che le pagine
 * divergano di due pixel l'una dall'altra man mano che se ne aggiungono.
 */
export const SettingsPage: React.FC<{
  title: string;
  children: React.ReactNode;
}> = ({ title, children }) => {
  const { colors } = useAppTheme();
  const { goBack } = useAppNav();
  const insets = useSafeAreaInsets();

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
            {title}
          </Text>
        </View>

        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + theme.spacing.lg },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
};

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
});
