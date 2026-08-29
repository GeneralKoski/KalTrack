import { DfButton } from "@/src/components/form/DfButton";
import { MetalPanel } from "@/src/components/kal";
import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import type { AssistantSession } from "@/src/containers/assistant/useAssistantSession";
import { useTranslation } from "@/src/hooks/useTranslation";
import { theme } from "@/src/styles";
import type { ToolIntent } from "@/src/ai/tools/types";
import { Check, Mic, Square, VolumeX, X } from "lucide-react-native";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface AssistantOverlayProps {
  visible: boolean;
  session: AssistantSession;
  onClose: () => void;
  onConfirm: (intent: ToolIntent, rememberChoice: boolean) => void;
  onDiscard: (intent: ToolIntent) => void;
}

export const AssistantOverlay: React.FC<AssistantOverlayProps> = ({
  visible,
  session,
  onClose,
  onConfirm,
  onDiscard,
}) => {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const [remember, setRemember] = useState<Record<string, boolean>>({});

  const busy =
    session.phase === "transcribing" || session.phase === "thinking";

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={[styles.backdrop, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: insets.top + theme.spacing.sm }]}>
          <TouchableOpacity onPress={onClose} activeOpacity={0.6} hitSlop={12}>
            <X size={24} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + 160 },
          ]}
        >
          {session.transcript ? (
            <Text style={[styles.transcript, { color: colors.text }]}>
              {session.transcript}
            </Text>
          ) : (
            <Text style={[styles.hint, { color: colors.textMuted }]}>
              {session.phase === "listening"
                ? t("assistant.listening")
                : t("assistant.hint")}
            </Text>
          )}

          {busy ? (
            <View style={styles.busy}>
              <ActivityIndicator color={colors.accent} />
              <Text
                style={[styles.busyLabel, { color: colors.textMuted }]}
                numberOfLines={1}
              >
                {t(
                  session.phase === "transcribing"
                    ? "assistant.transcribing"
                    : "assistant.thinking",
                )}
              </Text>
            </View>
          ) : null}

          {session.failure ? (
            <Text style={[styles.failure, { color: theme.colors.error }]}>
              {t(`assistant.error.${session.failure}`)}
            </Text>
          ) : null}

          {session.reply ? (
            <Text style={[styles.reply, { color: colors.text }]}>
              {session.reply}
            </Text>
          ) : null}

          {/* La voce è un canale in più: se manca, va detto invece di tacere. */}
          {session.spokenReplyUnavailable ? (
            <View style={styles.mutedRow}>
              <VolumeX size={14} color={colors.textFaint} />
              <Text
                style={[styles.mutedLabel, { color: colors.textFaint }]}
                numberOfLines={2}
              >
                {t("assistant.no_italian_voice")}
              </Text>
            </View>
          ) : null}

          {session.pending.map((intent, index) => (
            <MetalPanel
              key={`${intent.toolName}-${index}`}
              radius={theme.radius.xl}
              style={styles.card}
            >
              <View style={styles.cardInner}>
                <Text style={[styles.cardTitle, { color: colors.text }]}>
                  {intent.preview.title}
                </Text>
                {intent.preview.lines.map((line, lineIndex) => (
                  <Text
                    key={lineIndex}
                    style={[styles.cardLine, { color: colors.textSecondary }]}
                    numberOfLines={2}
                  >
                    {line}
                  </Text>
                ))}

                {/* Le cancellazioni restano sempre da confermare a mano. */}
                {intent.riskLevel === "destructive" ? null : (
                  <TouchableOpacity
                    style={styles.rememberRow}
                    onPress={() =>
                      setRemember((prev) => ({
                        ...prev,
                        [intent.toolName]: !prev[intent.toolName],
                      }))
                    }
                    activeOpacity={0.6}
                  >
                    <View
                      style={[
                        styles.checkbox,
                        {
                          borderColor: colors.border,
                          backgroundColor: remember[intent.toolName]
                            ? colors.accent
                            : "transparent",
                        },
                      ]}
                    >
                      {remember[intent.toolName] ? (
                        <Check size={12} color={colors.accentOn} />
                      ) : null}
                    </View>
                    <Text
                      style={[styles.rememberLabel, { color: colors.textMuted }]}
                      numberOfLines={2}
                    >
                      {t("assistant.dont_ask_again")}
                    </Text>
                  </TouchableOpacity>
                )}

                <View style={styles.actions}>
                  <DfButton
                    label={t("cancel")}
                    variant="outlined"
                    fullWidth={false}
                    onPress={() => onDiscard(intent)}
                    style={styles.action}
                  />
                  <DfButton
                    label={t("confirm")}
                    fullWidth={false}
                    onPress={() =>
                      onConfirm(intent, remember[intent.toolName] === true)
                    }
                    style={styles.action}
                  />
                </View>
              </View>
            </MetalPanel>
          ))}
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + theme.spacing.lg }]}>
          <TouchableOpacity
            onPress={
              session.phase === "listening"
                ? session.stopListening
                : session.startListening
            }
            activeOpacity={0.6}
            disabled={busy}
          >
            <View
              style={[
                styles.mic,
                {
                  backgroundColor:
                    session.phase === "listening"
                      ? theme.colors.error
                      : colors.accent,
                  opacity: busy ? 0.4 : 1,
                },
              ]}
            >
              {session.phase === "listening" ? (
                <Square size={26} color={theme.colors.white} fill={theme.colors.white} />
              ) : (
                <Mic size={30} color={colors.accentOn} />
              )}
            </View>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: { flex: 1 },
  header: {
    paddingHorizontal: theme.spacing.md,
    alignItems: "flex-end",
  },
  content: {
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  hint: { fontSize: 16, textAlign: "center", marginTop: theme.spacing.xl },
  transcript: { fontSize: 20, fontWeight: "600", lineHeight: 27 },
  busy: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  busyLabel: { flexShrink: 1, fontSize: 14 },
  failure: { fontSize: 15, fontWeight: "500" },
  reply: { fontSize: 16, lineHeight: 23 },
  mutedRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  mutedLabel: { flexShrink: 1, fontSize: 12 },
  card: { marginTop: theme.spacing.xs },
  cardInner: { padding: theme.spacing.md, gap: 4 },
  cardTitle: { fontSize: 15, fontWeight: "700" },
  cardLine: { fontSize: 14 },
  rememberRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: theme.radius.sm,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  rememberLabel: { flexShrink: 1, fontSize: 13 },
  actions: {
    flexDirection: "row",
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
  },
  action: { flex: 1 },
  footer: { alignItems: "center", paddingTop: theme.spacing.md },
  mic: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: "center",
    justifyContent: "center",
  },
});
