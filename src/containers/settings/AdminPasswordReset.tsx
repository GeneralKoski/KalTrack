import { DfButton } from "@/src/components/form/DfButton";
import { useAppTheme } from "@/src/components/ThemeContext";
import { Text, TextInput } from "@/src/components/ui";
import * as social from "@/src/api/social";
import { useTranslation } from "@/src/hooks/useTranslation";
import { theme } from "@/src/styles";
import { logger } from "@/src/utils/logger";
import { showToast } from "@/src/utils/toast";
import React, { useEffect, useState } from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";

/** Come la registrazione: una scorciatoia qui darebbe a un altro una password
 *  che a lui non sarebbe stata accettata. */
const MIN_LENGTH = 8;

/**
 * Rimettere a posto la password di qualcuno.
 *
 * Serve perche' non c'e' il recupero via email: senza, chi la dimentica resta
 * fuori. Il controllo di chi puo' farlo sta sul SERVER: qui la voce si nasconde
 * a chi non e' amministratore, ma nascondere non e' proteggere.
 */
export const AdminPasswordReset: React.FC = () => {
  const { t } = useTranslation();
  const { colors } = useAppTheme();

  const [utenti, setUtenti] = useState<social.AdminUser[]>([]);
  const [scelto, setScelto] = useState<social.AdminUser | null>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let attivo = true;
    social
      .fetchAllUsers()
      .then(({ users }) => {
        if (attivo) setUtenti(users);
      })
      .catch((error) => logger.warn("[admin] elenco non letto", error));
    return () => {
      attivo = false;
    };
  }, []);

  const conferma = async () => {
    if (!scelto) return;
    setBusy(true);
    try {
      await social.resetUserPassword(scelto.id, password);
      showToast.success({
        title: t("admin.done", { handle: scelto.handle }),
      });
      setPassword("");
      setScelto(null);
    } catch (error) {
      logger.warn("[admin] password non cambiata", error);
      showToast.error({ title: t("general_error") });
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.group, { backgroundColor: colors.surface }]}>
      <Text style={[styles.explain, { color: colors.textMuted }]}>
        {t("admin.explain")}
      </Text>

      {utenti.map((utente) => {
        const attivo = scelto?.id === utente.id;
        return (
          <TouchableOpacity
            key={utente.id}
            onPress={() => setScelto(attivo ? null : utente)}
            activeOpacity={0.6}
            hitSlop={8}
            style={[
              styles.row,
              {
                borderColor: attivo ? colors.accent : colors.border,
                backgroundColor: attivo ? colors.surfaceMuted : "transparent",
              },
            ]}
          >
            <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
              {utente.displayName}
            </Text>
            <Text style={[styles.handle, { color: colors.textMuted }]} numberOfLines={1}>
              @{utente.handle}
            </Text>
          </TouchableOpacity>
        );
      })}

      {scelto ? (
        <View style={styles.block}>
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder={t("admin.new_password")}
            placeholderTextColor={colors.textFaint}
            autoCapitalize="none"
            autoCorrect={false}
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
          <Text style={[styles.warning, { color: colors.textMuted }]}>
            {t("admin.logs_out", { handle: scelto.handle })}
          </Text>
          <DfButton
            label={t("admin.confirm")}
            onPress={conferma}
            loading={busy}
            disabled={password.trim().length < MIN_LENGTH}
          />
        </View>
      ) : null}
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
  row: {
    borderWidth: 1,
    borderRadius: theme.radius.lg,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  name: { fontSize: 15, fontWeight: "600" },
  handle: { fontSize: 13 },
  block: { gap: theme.spacing.sm, marginTop: theme.spacing.xs },
  input: {
    borderWidth: 1,
    borderRadius: theme.radius.lg,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    fontSize: 15,
  },
  warning: { fontSize: 12, lineHeight: 17 },
});
