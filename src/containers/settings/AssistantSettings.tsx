import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import { useTranslation } from "@/src/hooks/useTranslation";
import { useAssistantStore } from "@/src/stores/assistantStore";
import { theme } from "@/src/styles";
import React from "react";
import { StyleSheet, Switch, TouchableOpacity, View } from "react-native";

export const AssistantSettings: React.FC = () => {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const voiceReplyEnabled = useAssistantStore((s) => s.voiceReplyEnabled);
  const setVoiceReplyEnabled = useAssistantStore((s) => s.setVoiceReplyEnabled);
  const autoConfirm = useAssistantStore((s) => s.autoConfirm);
  const revokeAutoConfirm = useAssistantStore((s) => s.revokeAutoConfirm);

  return (
    <View style={[styles.group, { backgroundColor: colors.surface }]}>
      <View style={styles.row}>
        <Text style={[styles.label, { color: colors.text }]}>
          {t("assistant.voice_reply")}
        </Text>
        <Switch
          value={voiceReplyEnabled}
          onValueChange={setVoiceReplyEnabled}
          thumbColor={theme.colors.white}
          trackColor={{ false: colors.border, true: colors.accent }}
        />
      </View>

      <View style={[styles.divider, { backgroundColor: colors.border }]} />

      <View style={styles.block}>
        <Text style={[styles.label, { color: colors.text }]}>
          {t("assistant.auto_confirmed")}
        </Text>

        {autoConfirm.length === 0 ? (
          <Text style={[styles.empty, { color: colors.textMuted }]}>
            {t("assistant.auto_confirmed_empty")}
          </Text>
        ) : (
          autoConfirm.map((toolName) => (
            <View key={toolName} style={styles.autoRow}>
              <Text
                style={[styles.autoLabel, { color: colors.textSecondary }]}
                numberOfLines={1}
              >
                {t(`assistant.tool.${toolName}`)}
              </Text>
              <TouchableOpacity
                onPress={() => revokeAutoConfirm(toolName)}
                activeOpacity={0.6}
                hitSlop={8}
              >
                <Text style={[styles.revoke, { color: theme.colors.error }]}>
                  {t("assistant.revoke")}
                </Text>
              </TouchableOpacity>
            </View>
          ))
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  group: { borderRadius: theme.radius.xl, overflow: "hidden" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
  },
  block: { padding: theme.spacing.md, gap: theme.spacing.xs },
  divider: { height: StyleSheet.hairlineWidth },
  label: { flexShrink: 1, fontSize: 15, fontWeight: "500" },
  empty: { fontSize: 13 },
  autoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing.md,
    paddingVertical: 4,
  },
  autoLabel: { flexShrink: 1, fontSize: 14 },
  revoke: { fontSize: 13, fontWeight: "600" },
});
