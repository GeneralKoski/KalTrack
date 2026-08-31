import { useAppTheme } from "@/src/components/ThemeContext";
import { Card, ScreenBackground, SectionLabel } from "@/src/components/kal";
import { Text } from "@/src/components/ui";
import { AdminPasswordReset } from "@/src/containers/settings/AdminPasswordReset";
import { AiKeySettings } from "@/src/containers/settings/AiKeySettings";
import { AssistantSettings } from "@/src/containers/settings/AssistantSettings";
import { HealthConnectSettings } from "@/src/containers/settings/HealthConnectSettings";
import { ThemePicker } from "@/src/containers/settings/ThemePicker";
import { useAppNav } from "@/src/hooks/useAppNav";
import { useAccountStore } from "@/src/stores/accountStore";
import { useTranslation } from "@/src/hooks/useTranslation";
import { theme } from "@/src/styles";
import { useRoute, type RouteProp } from "@react-navigation/native";
import { ChevronLeft, ChevronRight, Stethoscope } from "lucide-react-native";
import React, { useRef, useState } from "react";
import { ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

export function SettingsScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { goBack, navigate } = useAppNav();
  const { colors } = useAppTheme();
  const isAdmin = useAccountStore((s) => s.profile?.isAdmin ?? false);

  /*
   * Chi arriva qui da "serve la chiave AI" vuole quel campo, non l'elenco
   * delle impostazioni: la sezione si porta sotto gli occhi da sola e il
   * cursore ci finisce dentro. La `y` arriva da onLayout perche' la sezione
   * non e' la prima e la sua altezza dipende dal tema e dalla lingua.
   */
  const route =
    useRoute<RouteProp<{ params: { focus?: "aiKey" } }, "params">>();
  const wantsAiKey = route.params?.focus === "aiKey";
  const scrollRef = useRef<ScrollView>(null);
  const [aiKeyY, setAiKeyY] = useState<number | null>(null);

  React.useEffect(() => {
    if (!wantsAiKey || aiKeyY === null) return;
    scrollRef.current?.scrollTo({ y: aiKeyY, animated: true });
  }, [wantsAiKey, aiKeyY]);

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

        <ScrollView
          ref={scrollRef}
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + theme.spacing.lg },
          ]}
        >
          <SectionLabel>{t("settings.theme")}</SectionLabel>
          <ThemePicker />

          <View onLayout={(e) => setAiKeyY(e.nativeEvent.layout.y)}>
            <SectionLabel style={styles.section}>
              {t("ai_key.title")}
            </SectionLabel>
            <AiKeySettings autoFocus={wantsAiKey} />
          </View>

          <SectionLabel style={styles.section}>
            {t("settings.assistant")}
          </SectionLabel>
          <AssistantSettings />

          <SectionLabel style={styles.section}>
            {t("settings.health")}
          </SectionLabel>
          <HealthConnectSettings />

          <SectionLabel style={styles.section}>
            {t("diagnostics.title")}
          </SectionLabel>
          <Card style={styles.rowCard} onPress={() => navigate("Diagnostics")}>
            <Stethoscope size={20} color={colors.textSecondary} />
            <View style={styles.rowText}>
              <Text style={[styles.rowTitle, { color: colors.text }]}>
                {t("diagnostics.open")}
              </Text>
              <Text style={[styles.rowHint, { color: colors.textFaint }]}>
                {t("diagnostics.open_hint")}
              </Text>
            </View>
            <ChevronRight size={20} color={colors.textFaint} />
          </Card>

          {/* Solo per l'amministratore. Il server rifiuta comunque gli altri:
              questa e' una comodita', non la difesa. */}
          {isAdmin ? (
            <>
              <SectionLabel style={styles.section}>
                {t("admin.title")}
              </SectionLabel>
              <AdminPasswordReset />
            </>
          ) : null}
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
  rowCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
  },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 15, fontWeight: "600" },
  rowHint: { fontSize: 12 },
});
