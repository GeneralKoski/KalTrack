import { ApiError } from "@/src/api/client";
import * as social from "@/src/api/social";
import { DfButton } from "@/src/components/form/DfButton";
import { useAppTheme } from "@/src/components/ThemeContext";
import { Text, TextInput } from "@/src/components/ui";
import { useTranslation } from "@/src/hooks/useTranslation";
import { runSync } from "@/src/services/sync";
import { useAccountStore } from "@/src/stores/accountStore";
import { theme } from "@/src/styles";
import { logger } from "@/src/utils/logger";
import { showToast } from "@/src/utils/toast";
import { Eye, EyeOff } from "lucide-react-native";
import React, { useRef, useState } from "react";
import {
  StyleSheet,
  TouchableOpacity,
  View,
  type TextInput as RNTextInput,
} from "react-native";

/**
 * Entrata e registrazione, nella stessa schermata.
 *
 * Due schermate separate costringerebbero a scegliere prima di sapere se si ha
 * gia' un account, e qui l'account si crea una volta sola in tutta la vita
 * dell'app.
 *
 * Gli errori del server si mostrano in un toast (il messaggio) e sul campo che
 * li ha causati (il bordo rosso, senza testo sotto): un errore in cima alla
 * pagina senza indicare il campo lascerebbe a chi legge il compito di
 * indovinare quale dei quattro riscrivere.
 */
export const AccountForm: React.FC = () => {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const signIn = useAccountStore((s) => s.signIn);

  const [isRegistering, setIsRegistering] = useState(false);
  const [email, setEmail] = useState("");
  // In accesso questo campo accetta l'email OPPURE il nome utente.
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [handle, setHandle] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [showPassword, setShowPassword] = useState(false);

  const handleRef = useRef<RNTextInput | null>(null);
  const emailRef = useRef<RNTextInput | null>(null);
  const loginRef = useRef<RNTextInput | null>(null);
  const passwordRef = useRef<RNTextInput | null>(null);

  const submit = async () => {
    setBusy(true);
    setErrors({});
    try {
      const result = isRegistering
        ? await social.register({ email, password, handle, displayName })
        : await social.login({ login, password });
      await signIn(result.token);
      showToast.success({ title: t("social.login_success") });
      // Subito, non al prossimo giro: chi entra su un telefono nuovo si
      // aspetta di ritrovare i suoi dati adesso, non fra un quarto d'ora.
      void runSync();
    } catch (error) {
      logger.warn("[account] accesso non riuscito", error);
      if (error instanceof ApiError) {
        setErrors(error.errors);
        // Il messaggio va sempre nel toast, non piu' sotto il campo: qui resta
        // solo il bordo rosso a dire quale campo l'ha causato. Il server ha
        // gia' scelto quale mostrare quando i campi sbagliati sono piu' di
        // uno (vedi `ValidationMessage::summarize` nel backend): non lo si
        // rifa' qui prendendo "il primo campo che capita".
        showToast.error({ title: error.message });
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
      inputRef?: React.RefObject<RNTextInput | null>;
      /** Il campo dopo questo: l'invio ci porta il cursore. */
      next?: React.RefObject<RNTextInput | null>;
    } = {},
  ) => (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.textMuted }]}>{label}</Text>
      <View style={styles.inputRow}>
        <TextInput
          ref={options.inputRef}
          value={value}
          onChangeText={onChange}
          secureTextEntry={options.secure && !showPassword}
          autoCapitalize={options.autoCapitalize ?? "none"}
          autoCorrect={false}
          keyboardType={options.keyboardType}
          /*
           * L'invio porta al campo dopo, e sull'ultimo manda il modulo.
           * Prima ogni campo chiudeva la tastiera con "fatto", anche col
           * modulo mezzo vuoto.
           */
          returnKeyType={options.next ? "next" : "go"}
          onSubmitEditing={() => {
            if (options.next) options.next.current?.focus();
            else void submit();
          }}
          submitBehavior={options.next ? "submit" : "blurAndSubmit"}
          style={[
            styles.input,
            options.secure && styles.inputWithEye,
            {
              backgroundColor: colors.surface,
              borderColor: errors[key] ? theme.colors.error : colors.border,
              color: colors.text,
            },
          ]}
        />
        {options.secure ? (
          <TouchableOpacity
            onPress={() => setShowPassword((v) => !v)}
            activeOpacity={0.6}
            hitSlop={10}
            style={styles.eye}
            accessibilityLabel={t(
              showPassword ? "password_hide" : "password_show",
            )}
          >
            {showPassword ? (
              <EyeOff size={20} color={colors.textFaint} />
            ) : (
              <Eye size={20} color={colors.textFaint} />
            )}
          </TouchableOpacity>
        ) : null}
      </View>
      {options.hint ? (
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
            { autoCapitalize: "words", next: handleRef },
          )
        : null}
      {isRegistering
        ? field("handle", t("social.handle"), handle, setHandle, {
            hint: t("social.handle_hint"),
            inputRef: handleRef,
            next: emailRef,
          })
        : null}
      {isRegistering
        ? field("email", t("social.email"), email, setEmail, {
            keyboardType: "email-address",
            inputRef: emailRef,
            next: passwordRef,
          })
        : field("login", t("social.login_field"), login, setLogin, {
            hint: t("social.login_hint"),
            inputRef: loginRef,
            next: passwordRef,
          })}
      {field("password", t("social.password"), password, setPassword, {
        secure: true,
        inputRef: passwordRef,
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
          // La password non sopravvive al cambio di modulo: quella scelta per
          // un account nuovo non e' quella con cui si entra in uno che esiste
          // gia', e ritrovarla scritta fa premere Accedi senza guardarla.
          setPassword("");
          setShowPassword(false);
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
  inputRow: { justifyContent: "center" },
  eye: {
    position: "absolute",
    right: theme.spacing.md,
  },
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
    paddingVertical: theme.spacing.md,
    fontSize: 16,
  },
  inputWithEye: { paddingRight: 44 },
  hint: { fontSize: 12, lineHeight: 16 },
  submit: { marginTop: theme.spacing.sm },
  switch: { alignSelf: "center", paddingVertical: theme.spacing.sm },
  switchLabel: { fontSize: 14, fontWeight: "600" },
});
