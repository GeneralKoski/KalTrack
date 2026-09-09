import {
  HeroDivider,
  HeroPanel,
  ListGroup,
  ListRow,
  ScreenBackground,
  SectionLabel,
} from "@/src/components/kal";
import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import { useAppNav } from "@/src/hooks/useAppNav";
import { useTranslation } from "@/src/hooks/useTranslation";
import { useAccountStore } from "@/src/stores/accountStore";
import { theme } from "@/src/styles";
import {
  Camera,
  ChevronLeft,
  MessageSquare,
  ScanLine,
  Sparkles,
  Sprout,
  TrendingUp,
  Utensils,
  type LucideIcon,
} from "lucide-react-native";
import React from "react";
import { ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

/**
 * La pagina dei piani: dove arriva chi tocca un comando AI senza diritto.
 *
 * E' UN CARTELLO, NON UNA SERRATURA: la chiave Gemini sta nel bundle e l'app
 * la chiama diretta (vedi CLAUDE.md § AI), quindi qui non si vende niente
 * davvero. E' un segnaposto onesto - dice cosa arrivera' e che oggi non e'
 * acquistabile - non un finto listino: un prezzo inventato sarebbe peggio di
 * nessun prezzo, e questa schermata la vede un utente vero.
 */

interface Feature {
  key: "assistant" | "photo" | "label" | "routine" | "meal_plan" | "weekly_coach";
  Icon: LucideIcon;
}

const FEATURES: Feature[] = [
  { key: "assistant", Icon: MessageSquare },
  { key: "photo", Icon: Camera },
  { key: "label", Icon: ScanLine },
  { key: "routine", Icon: Sparkles },
  { key: "meal_plan", Icon: Utensils },
  { key: "weekly_coach", Icon: TrendingUp },
];

export function PlansScreen() {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { navigate, goBack } = useAppNav();
  /*
   * Il motivo per cui si e' arrivati qui NON e' lo stesso per tutti. Chi non
   * ha un account e' la popolazione piu' grande che tocca questo cancello
   * (`ai_enabled` nasce ACCESO): per lei la pagina dei piani e' un vicolo
   * cieco vero se dice "abbonati", quando il rimedio reale e oggi disponibile
   * e' accedere. Chi ha gia' un account e non ha il diritto e' l'unico caso
   * in cui parlare di abbonamento e' onesto. Un motivo vero ma irrilevante e'
   * comunque una bugia, e questa schermata la vede un utente vero.
   *
   * `token !== null` da solo commette lo stesso errore che il resto del
   * task esiste per correggere: prima che `restore()` finisca, `token` e'
   * `null` senza dire ancora niente su un account - un deep link diretto a
   * questa pagina (`kaltrack://abbonamento`) a freddo mostrerebbe "serve un
   * account" a un utente che ce l'ha gia' e ha pure il diritto. Finche' non
   * si sa, si assume che l'account ci sia: e' l'errore piu' innocuo dei
   * due, sparisce da solo al prossimo aggiornamento dello store, e non manda
   * nessuno a creare un account che ha gia'.
   */
  const hasAccount = useAccountStore(
    (s) => !s.isHydrated || s.token !== null,
  );

  return (
    <View style={styles.root}>
      <ScreenBackground />
      <SafeAreaView edges={["top", "left", "right"]} style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity onPress={goBack} activeOpacity={0.6} hitSlop={10}>
            <ChevronLeft size={26} color={colors.textSecondary} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
            {t("plans.title")}
          </Text>
        </View>

        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + theme.spacing.lg },
          ]}
        >
          <HeroPanel>
            <Sprout size={26} color={colors.text} />
            <Text style={[styles.heroTitle, { color: colors.text }]}>
              {t(hasAccount ? "plans.hero_title" : "plans.no_account_title")}
            </Text>
            <HeroDivider style={styles.heroDivider} />
            <Text style={[styles.heroBody, { color: colors.textSecondary }]}>
              {t(hasAccount ? "plans.hero_body" : "plans.no_account_body")}
            </Text>
          </HeroPanel>

          {hasAccount ? null : (
            <ListGroup indent={0}>
              <ListRow
                label={t("plans.no_account_action")}
                onPress={() => navigate("Friends")}
              />
            </ListGroup>
          )}

          <SectionLabel style={styles.section}>
            {t("plans.section_included")}
          </SectionLabel>
          <ListGroup>
            {FEATURES.map(({ key, Icon }) => (
              <ListRow
                key={key}
                icon={<Icon size={20} color={colors.text} />}
                label={t(`plans.feature.${key}.label`)}
                detail={t(`plans.feature.${key}.detail`)}
              />
            ))}
          </ListGroup>

          {hasAccount ? (
            <Text style={[styles.note, { color: colors.textMuted }]}>
              {t("plans.not_available")}
            </Text>
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
  title: { flex: 1, fontSize: 18, fontWeight: "700" },
  content: { padding: theme.spacing.md, gap: theme.spacing.md },
  heroTitle: { fontSize: 18, fontWeight: "700", marginTop: theme.spacing.sm },
  heroDivider: { marginVertical: theme.spacing.sm },
  heroBody: { fontSize: 14, lineHeight: 20 },
  section: { marginTop: theme.spacing.sm },
  note: { fontSize: 12, lineHeight: 17, marginTop: theme.spacing.xs },
});
