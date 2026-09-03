import { DfAlert } from "@/src/components/DfAlert";
import { DfButton } from "@/src/components/form/DfButton";
import { Card, ScreenBackground } from "@/src/components/kal";
import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import { useAppNav } from "@/src/hooks/useAppNav";
import { useTranslation } from "@/src/hooks/useTranslation";
import { useAccountStore } from "@/src/stores/accountStore";
import { useThemeStore } from "@/src/stores/themeStore";
import { theme } from "@/src/styles";
import {
  ChevronLeft,
  ChevronRight,
  HeartPulse,
  LogOut,
  Palette,
  ShieldCheck,
  Stethoscope,
  UtensilsCrossed,
} from "lucide-react-native";
import React, { useState } from "react";
import { ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

/**
 * Le impostazioni sono un elenco di voci, non una pagina che le contiene tutte.
 *
 * Ogni riga porta dentro, dove stanno le scelte con la spunta su quella attiva
 * - la stessa forma della scelta del pasto nel foglio Aggiungi. Prima ogni
 * sezione era stesa qui sotto la sua etichetta, e bastava aggiungerne una
 * perche' quella dopo finisse sotto lo scorrimento.
 *
 * Il valore corrente si mostra dove la sezione E' una scelta sola (il tema).
 * Sulle altre no: "Assistente: 2 impostazioni" non dice niente a nessuno.
 */
export function SettingsScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { goBack, navigate } = useAppNav();
  const { colors } = useAppTheme();
  const isAdmin = useAccountStore((s) => s.profile?.isAdmin ?? false);
  const token = useAccountStore((s) => s.token);
  const signOut = useAccountStore((s) => s.signOut);
  const themeMode = useThemeStore((s) => s.mode);

  const [confirmSignOut, setConfirmSignOut] = useState(false);

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
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + theme.spacing.lg },
          ]}
        >
          <SettingsRow
            icon={<Palette size={20} color={colors.textSecondary} />}
            label={t("settings.theme")}
            value={t(`settings.theme_${themeMode}`)}
            onPress={() => navigate("Appearance")}
          />
          <SettingsRow
            icon={<HeartPulse size={20} color={colors.textSecondary} />}
            label={t("settings.health")}
            onPress={() => navigate("Health")}
          />
          <SettingsRow
            icon={<UtensilsCrossed size={20} color={colors.textSecondary} />}
            label={t("meal_types.settings_row")}
            onPress={() => navigate("MealTypes")}
          />
          <SettingsRow
            icon={<Stethoscope size={20} color={colors.textSecondary} />}
            label={t("diagnostics.title")}
            onPress={() => navigate("Diagnostics")}
          />

          {/* Solo per l'amministratore. Il server rifiuta comunque gli altri:
              questa e' una comodita', non la difesa. */}
          {isAdmin ? (
            <SettingsRow
              icon={<ShieldCheck size={20} color={colors.textSecondary} />}
              label={t("admin.title")}
              onPress={() => navigate("Admin")}
            />
          ) : null}

          {/*
            L'uscita sta in fondo alle impostazioni e in nessun altro posto:
            e' dove la si cerca, e non e' una voce dell'elenco - le righe qui
            portano dentro una pagina, questa fa una cosa e non si torna
            indietro. Senza sessione non c'e' niente da cui uscire.
          */}
          {token ? (
            <DfButton
              label={t("social.sign_out")}
              variant="outlined"
              color={theme.colors.error}
              icon={<LogOut size={18} color={theme.colors.error} />}
              onPress={() => setConfirmSignOut(true)}
              style={styles.signOut}
            />
          ) : null}
        </ScrollView>
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
        }}
        onClose={() => setConfirmSignOut(false)}
      />
    </View>
  );
}

const SettingsRow: React.FC<{
  icon: React.ReactNode;
  label: string;
  value?: string;
  onPress: () => void;
}> = ({ icon, label, value, onPress }) => {
  const { colors } = useAppTheme();

  return (
    <Card style={styles.rowCard} onPress={onPress}>
      {icon}
      <Text style={[styles.rowLabel, { color: colors.text }]} numberOfLines={1}>
        {label}
      </Text>
      {value ? (
        <Text style={[styles.rowValue, { color: colors.textMuted }]}>
          {value}
        </Text>
      ) : null}
      <ChevronRight size={20} color={colors.textFaint} />
    </Card>
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
  rowCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
  },
  rowLabel: { flex: 1, fontSize: 15, fontWeight: "600" },
  rowValue: { fontSize: 14 },
  signOut: { marginTop: theme.spacing.lg },
});
