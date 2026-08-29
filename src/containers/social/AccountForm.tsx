import { ApiError } from "@/src/api/client";
import * as social from "@/src/api/social";
import { DfButton } from "@/src/components/form/DfButton";
import { useAppTheme } from "@/src/components/ThemeContext";
import { Text, TextInput } from "@/src/components/ui";
import { useTranslation } from "@/src/hooks/useTranslation";
import { useAccountStore } from "@/src/stores/accountStore";
import { theme } from "@/src/styles";
import { logger } from "@/src/utils/logger";
import { showToast } from "@/src/utils/toast";
import React, { useState } from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";

/**
 * Entrata e registrazione, nella stessa schermata.
 *
 * Due schermate separate costringerebbero a scegliere prima di sapere se si ha
 * gia' un account, e qui l'account si crea una volta sola in tutta la vita
 * dell'app.
 *
 * Gli errori del server si mostrano SOTTO il campo che li ha causati: "Questo
 * nome utente e' gia' preso" in cima alla pagina lascia a chi legge il compito
 * di indovinare quale dei quattro campi riscrivere.
 */
export const AccountForm: React.FC = () => {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const signIn = useAccountStore((s) => s.signIn);

  const [isRegistering, setIsRegistering] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [handle, setHandle] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[]>>({});

  const submit = async () => {
    setBusy(true);
    setErrors({});
    try {
      const result = isRegistering
        ? await social.register({ email, password, handle, displayName })
        : await social.login({ email, password });
      await signIn(result.token);
    } catch (error) {
      logger.warn("[account] accesso non riuscito", error);
      if (error instanceof ApiError) {
        setErrors(error.errors);
        // Un errore senza dettagli per campo non ha dove andare se non in un
        // toast: senza, il tocco sembrerebbe non essere arrivato.
        if (Object.keys(error.errors).length === 0) {
          showToast.error({ title: error.message });
        }
      } else {
        showToast.error({ title: t("general_error") });
      }
    } finally {
      setBusy(false);
    }
  };

  const field = (
    key: string,
    label: string,
    value: string,
    onChange: (v: string) => void,
    options: {
      secure?: boolean;
      autoCapitalize?: "none" | "words";
      keyboardType?: "email-address" | "default";
      hint?: string;
    } = {},
  ) => (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.textMuted }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        secureTextEntry={options.secure}
        autoCapitalize={options.autoCapitalize ?? "none"}
        autoCorrect={false}
        keyboardType={options.keyboardType}
        style={[
          styles.input,
          {
            backgroundColor: colors.surface,
            borderColor: errors[key] ? theme.colors.error : colors.border,
            color: colors.text,
          },
        ]}
      />
      {errors[key] ? (
        <Text style={[styles.error, { color: theme.colors.error }]}>
          {errors[key][0]}
        </Text>
      ) : options.hint ? (
        <Text style={[styles.hint, { color: colors.textFaint }]}>
          {options.hint}
        </Text>
      ) : null}
    </View>
  );

  return (
    <View style={styles.root}>
      <Text style={[styles.intro, { color: colors.textMuted }]}>
        {t("social.account_intro")}
      </Text>

      {isRegistering
        ? field(
            "displayName",
            t("social.display_name"),
            displayName,
            setDisplayName,
            { autoCapitalize: "words" },
          )
        : null}
      {isRegistering
        ? field("handle", t("social.handle"), handle, setHandle, {
            hint: t("social.handle_hint"),
          })
        : null}
      {field("email", t("social.email"), email, setEmail, {
        keyboardType: "email-address",
      })}
      {field("password", t("social.password"), password, setPassword, {
        secure: true,
      })}

      <DfButton
        label={isRegistering ? t("social.register") : t("social.login")}
        loading={busy}
        onPress={submit}
        style={styles.submit}
      />

      <TouchableOpacity
        onPress={() => {
          setIsRegistering((current) => !current);
          setErrors({});
        }}
        activeOpacity={0.6}
        hitSlop={8}
        style={styles.switch}
      >
        <Text style={[styles.switchLabel, { color: colors.accent }]}>
          {isRegistering ? t("social.have_account") : t("social.no_account")}
        </Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { gap: theme.spacing.sm },
  intro: { fontSize: 14, lineHeight: 20, marginBottom: theme.spacing.sm },
  field: { gap: 4 },
  label: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  input: {
    borderWidth: 1,
    borderRadius: theme.radius.lg,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    fontSize: 16,
  },
  error: { fontSize: 12, lineHeight: 16 },
  hint: { fontSize: 12, lineHeight: 16 },
  submit: { marginTop: theme.spacing.sm },
  switch: { alignSelf: "center", paddingVertical: theme.spacing.sm },
  switchLabel: { fontSize: 14, fontWeight: "600" },
});
