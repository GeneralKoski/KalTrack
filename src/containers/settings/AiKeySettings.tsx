import { DfButton } from "@/src/components/form/DfButton";
import { useAppTheme } from "@/src/components/ThemeContext";
import { Text, TextInput } from "@/src/components/ui";
import { useTranslation } from "@/src/hooks/useTranslation";
import { useAiKeyStore } from "@/src/stores/aiKeyStore";
import { theme } from "@/src/styles";
import { logger } from "@/src/utils/logger";
import { showToast } from "@/src/utils/toast";
import React, { useState } from "react";
import { Linking, StyleSheet, TouchableOpacity, View } from "react-native";

/** Dove si prende una chiave, per chi non l'ha mai fatto. */
const GROQ_CONSOLE = "https://console.groq.com/keys";

interface AiKeySettingsProps {
  /** Vero quando si arriva qui da "serve la chiave AI": il cursore parte nel campo. */
  autoFocus?: boolean;
}

/**
 * La chiave dell'assistente, che e' di chi usa l'app.
 *
 * Una chiave gia' salvata non si rimostra: si dice che c'e' e se ne mostra la
 * coda. Riproporla in un campo di testo la esporrebbe a chiunque guardi lo
 * schermo, e non serve a niente - chi la vuole cambiare la incolla nuova, non
 * la rilegge.
 */
export const AiKeySettings: React.FC<AiKeySettingsProps> = ({ autoFocus }) => {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const key = useAiKeyStore((s) => s.key);
  const save = useAiKeyStore((s) => s.save);
  const clear = useAiKeyStore((s) => s.clear);

  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const salva = async () => {
    setBusy(true);
    try {
      await save(draft);
      setDraft("");
      showToast.success({ title: t("ai_key.saved") });
    } catch (error) {
      logger.warn("[ai] chiave non salvata", error);
      showToast.error({ title: t("general_error") });
    } finally {
      setBusy(false);
    }
  };

  const rimuovi = async () => {
    try {
      await clear();
      showToast.success({ title: t("ai_key.removed") });
    } catch (error) {
      logger.warn("[ai] chiave non rimossa", error);
      showToast.error({ title: t("general_error") });
    }
  };

  return (
    <View style={[styles.group, { backgroundColor: colors.surface }]}>
      <Text style={[styles.explain, { color: colors.textMuted }]}>
        {t("ai_key.explain")}
      </Text>

      {key ? (
        <View style={styles.block}>
          <Text style={[styles.label, { color: colors.text }]}>
            {t("ai_key.configured", { tail: key.slice(-4) })}
          </Text>
          <TouchableOpacity
            onPress={rimuovi}
            activeOpacity={0.6}
            hitSlop={8}
            style={styles.remove}
          >
            <Text style={[styles.removeLabel, { color: theme.colors.error }]}>
              {t("ai_key.remove")}
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <View style={styles.block}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder={t("ai_key.placeholder")}
          placeholderTextColor={colors.textFaint}
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus={autoFocus}
          secureTextEntry
          style={[
            styles.input,
            {
              backgroundColor: colors.background,
              borderColor: colors.border,
              color: colors.text,
            },
          ]}
        />
        <DfButton
          label={key ? t("ai_key.replace") : t("ai_key.save")}
          onPress={salva}
          loading={busy}
          disabled={draft.trim().length === 0}
        />
      </View>

      <TouchableOpacity
        onPress={() => void Linking.openURL(GROQ_CONSOLE)}
        activeOpacity={0.6}
        hitSlop={8}
      >
        <Text style={[styles.link, { color: colors.accent }]}>
          {t("ai_key.where")}
        </Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  group: {
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  explain: { fontSize: 13, lineHeight: 19 },
  block: { gap: theme.spacing.sm },
  label: { fontSize: 14, fontWeight: "600" },
  input: {
    borderWidth: 1,
    borderRadius: theme.radius.lg,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    fontSize: 15,
  },
  remove: { alignSelf: "flex-start" },
  removeLabel: { fontSize: 14, fontWeight: "600" },
  link: { fontSize: 14, fontWeight: "600" },
});
