import type { ToolIntent } from "@/src/ai/tools/types";
import { DfButton } from "@/src/components/form/DfButton";
import { MetalPanel } from "@/src/components/kal";
import { useAppTheme } from "@/src/components/ThemeContext";
import { Text, TextInput } from "@/src/components/ui";
import type { AssistantSession } from "@/src/containers/assistant/useAssistantSession";
import { VoiceOrb } from "@/src/containers/assistant/VoiceOrb";
import { useTranslation } from "@/src/hooks/useTranslation";
import { theme } from "@/src/styles";
import { ArrowUp, Check, Mic, VolumeX, X } from "lucide-react-native";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
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
  const [inputText, setInputText] = useState("");

  const busy = session.phase === "thinking";
  const listening = session.phase === "listening";
  const transcribing = session.phase === "transcribing";

  const cancelVoice = () => {
    if (listening || transcribing) {
      void session.cancelListening();
    }
  };

  const handleSendText = () => {
    const text = inputText.trim();
    if (!text || busy) return;
    setInputText("");
    Keyboard.dismiss();
    void session.submitText(text);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={[styles.backdrop, { backgroundColor: colors.background }]}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View
          style={[styles.header, { paddingTop: insets.top + theme.spacing.sm }]}
        >
          <TouchableOpacity onPress={onClose} activeOpacity={0.6} hitSlop={12}>
            <X size={24} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + theme.spacing.md },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          {/* Mentre si parla la palla e' l'unica cosa a schermo che conta:
              dice che il microfono sente davvero, e si tocca per fermarsi. */}
          {listening ? (
            <VoiceOrb level={session.level} onPress={session.stopListening} />
          ) : null}

          {session.transcript ? (
            <Text style={[styles.transcript, { color: colors.text }]}>
              {session.transcript}
            </Text>
          ) : !listening ? (
            <Text style={[styles.hint, { color: colors.textMuted }]}>
              {t("assistant.hint")}
            </Text>
          ) : null}

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
                      style={[
                        styles.rememberLabel,
                        { color: colors.textMuted },
                      ]}
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

        {/* Input in fondo: campo testo + pulsante invio e microfono.
            Spento mentre si registra per non interferire. */}
        {listening ? null : (
          <View
            style={[
              styles.footer,
              { paddingBottom: insets.bottom + theme.spacing.md },
            ]}
          >
            <View style={styles.inputRow}>
              <View
                style={[
                  styles.inputContainer,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  },
                ]}
              >
                <TextInput
                  style={[styles.textInput, { color: colors.text }]}
                  placeholder={t("assistant.text_input_placeholder")}
                  placeholderTextColor={colors.textMuted}
                  value={inputText}
                  onChangeText={(text) => {
                    setInputText(text);
                    cancelVoice();
                  }}
                  onFocus={cancelVoice}
                  onSubmitEditing={handleSendText}
                  returnKeyType="send"
                  editable={!busy}
                />
                {inputText.trim().length > 0 ? (
                  <TouchableOpacity
                    onPress={handleSendText}
                    activeOpacity={0.6}
                    disabled={busy}
                    style={[
                      styles.sendButton,
                      { backgroundColor: colors.accent },
                    ]}
                    accessibilityLabel={t("assistant.send")}
                  >
                    <ArrowUp size={18} color={colors.accentOn} />
                  </TouchableOpacity>
                ) : null}
              </View>

              <TouchableOpacity
                onPress={session.startListening}
                activeOpacity={0.6}
                disabled={busy}
                accessibilityLabel={t("assistant.open")}
              >
                <View
                  style={[
                    styles.mic,
                    { backgroundColor: colors.accent, opacity: busy ? 0.4 : 1 },
                  ]}
                >
                  <Mic size={24} color={colors.accentOn} />
                </View>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: { flex: 1 },
  scroll: { flex: 1 },
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
  footer: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.xs,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  inputContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
    paddingLeft: theme.spacing.md,
    paddingRight: theme.spacing.xs,
  },
  textInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 0,
  },
  sendButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  mic: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
  },
});
