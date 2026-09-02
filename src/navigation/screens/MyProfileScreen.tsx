import * as social from "@/src/api/social";
import { DfAlert } from "@/src/components/DfAlert";
import { DfButton } from "@/src/components/form/DfButton";
import { FormScreen } from "@/src/components/FormScreen";
import { ScreenBackground, SectionLabel } from "@/src/components/kal";
import { useAppTheme } from "@/src/components/ThemeContext";
import { Text, TextInput } from "@/src/components/ui";
import { ShareSettings } from "@/src/containers/social/ShareSettings";
import { useAppNav } from "@/src/hooks/useAppNav";
import { useTranslation } from "@/src/hooks/useTranslation";
import { useAccountStore } from "@/src/stores/accountStore";
import { theme } from "@/src/styles";
import { logger } from "@/src/utils/logger";
import { showToast } from "@/src/utils/toast";
import { ChevronLeft, LogOut } from "lucide-react-native";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * Il proprio account: chi sei, cosa condividi, e come uscire.
 *
 * L'anteprima di cosa vedono gli altri non c'e' e non serve: le condivisioni
 * sono quattro interruttori con la loro etichetta, e una finta vista "come ti
 * vedono" sarebbe una seconda copia della stessa regola, che puo' divergere.
 */
export function MyProfileScreen() {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { goBack } = useAppNav();

  const token = useAccountStore((s) => s.token);
  const profile = useAccountStore((s) => s.profile);
  const setProfile = useAccountStore((s) => s.setProfile);
  const refreshProfile = useAccountStore((s) => s.refreshProfile);
  const signOut = useAccountStore((s) => s.signOut);

  const [displayName, setDisplayName] = useState("");
  const [handle, setHandle] = useState("");
  const [email, setEmail] = useState("");
  const [bio, setBio] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);

  useEffect(() => {
    void refreshProfile();
  }, [refreshProfile]);

  /*
   * Sessione finita: si esce da qui.
   *
   * `refreshProfile` gestisce gia' il 401 e azzera token e profilo, ma questa
   * schermata mostra il caricamento finche' il profilo non c'e' - e senza
   * sessione non arrivera' mai. Il risultato era una rotella che girava per
   * sempre, con l'unica via d'uscita nel tasto indietro. Capita davvero: basta
   * una password cambiata da un altro dispositivo.
   */
  useEffect(() => {
    if (!token) goBack();
  }, [token, goBack]);

  useEffect(() => {
    if (!profile) return;
    setDisplayName(profile.displayName);
    setHandle(profile.handle);
    setEmail(profile.email);
    setBio(profile.bio ?? "");
  }, [profile]);

  const save = async () => {
    setSaving(true);
    try {
      setProfile(
        await social.updateMyProfile({
          displayName,
          /*
           * Nome utente ed email si mandano solo se sono cambiati.
           *
           * Sono gli unici due campi unici della tabella: rimandare sempre il
           * proprio vale un controllo di unicita' contro se stessi, e basta un
           * dettaglio sbagliato in quel controllo perche' salvare la bio
           * fallisca con "questo nome utente e' gia' preso" - cioe' il
           * proprio.
           */
          ...(handle !== profile?.handle ? { handle } : {}),
          ...(email !== profile?.email ? { email } : {}),
          // Stringa vuota e null non sono la stessa cosa a database: una bio
          // cancellata deve tornare assente, non diventare due apici.
          bio: bio.trim() === "" ? null : bio.trim(),
        }),
      );
      showToast.success({ title: t("social.profile_saved") });
    } catch (error) {
      logger.warn("[social] profilo non salvato", error);
      showToast.error({ title: t("social.share_failed") });
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.root}>
      <ScreenBackground />
      <SafeAreaView edges={["top", "left", "right"]} style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity onPress={goBack} activeOpacity={0.6} hitSlop={10}>
            <ChevronLeft size={26} color={colors.textSecondary} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
            {t("social.my_profile")}
          </Text>
        </View>

        {!profile ? (
          <ActivityIndicator style={styles.loader} color={colors.accent} />
        ) : (
          <FormScreen
            contentContainerStyle={[
              styles.content,
              { paddingBottom: insets.bottom + theme.spacing.lg },
            ]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={[styles.label, { color: colors.textMuted }]}>
              {t("social.handle")}
            </Text>
            <TextInput
              value={handle}
              onChangeText={setHandle}
              autoCapitalize="none"
              autoCorrect={false}
              style={[
                styles.input,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  color: colors.text,
                },
              ]}
            />

            <Text style={[styles.label, { color: colors.textMuted }]}>
              {t("social.email")}
            </Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              style={[
                styles.input,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  color: colors.text,
                },
              ]}
            />

            <Text style={[styles.label, { color: colors.textMuted }]}>
              {t("social.display_name")}
            </Text>
            <TextInput
              value={displayName}
              onChangeText={setDisplayName}
              style={[
                styles.input,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  color: colors.text,
                },
              ]}
            />

            <Text style={[styles.label, { color: colors.textMuted }]}>
              {t("social.bio")}
            </Text>
            <TextInput
              value={bio}
              onChangeText={setBio}
              multiline
              maxLength={160}
              style={[
                styles.input,
                styles.bio,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  color: colors.text,
                },
              ]}
            />

            <DfButton
              label={t("save")}
              loading={saving}
              onPress={save}
              style={styles.save}
            />

            <SectionLabel style={styles.section}>
              {t("social.shares")}
            </SectionLabel>
            <ShareSettings />

            <DfButton
              label={t("social.sign_out")}
              variant="outlined"
              color={theme.colors.error}
              icon={<LogOut size={18} color={theme.colors.error} />}
              onPress={() => setConfirmSignOut(true)}
              style={styles.section}
            />
          </FormScreen>
        )}
      </SafeAreaView>

      <DfAlert
        isOpen={confirmSignOut}
        title={t("social.sign_out")}
        message={t("social.sign_out_message")}
        confirmLabel={t("social.sign_out")}
        confirmColor={theme.colors.error}
        onConfirm={async () => {
          setConfirmSignOut(false);
          await signOut();
          goBack();
        }}
        onClose={() => setConfirmSignOut(false)}
      />
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
  title: { flex: 1, fontSize: 24, fontWeight: "700" },
  content: { padding: theme.spacing.md, gap: theme.spacing.xs },
  loader: { marginTop: theme.spacing.xl },
  card: { gap: 2, marginBottom: theme.spacing.sm },
  handle: { fontSize: 16, fontWeight: "600" },
  email: { fontSize: 13 },
  label: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginTop: theme.spacing.sm,
  },
  input: {
    borderWidth: 1,
    borderRadius: theme.radius.lg,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    fontSize: 16,
  },
  bio: { minHeight: 80, textAlignVertical: "top" },
  save: { marginTop: theme.spacing.md },
  section: { marginTop: theme.spacing.md },
});
