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
import { theme } from "@/src/styles";
import {
  Camera,
  ChevronLeft,
  MessageSquare,
  ScanLine,
  Sparkles,
  Sprout,
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
  key: "assistant" | "photo" | "label" | "routine";
  Icon: LucideIcon;
}

const FEATURES: Feature[] = [
  { key: "assistant", Icon: MessageSquare },
  { key: "photo", Icon: Camera },
  { key: "label", Icon: ScanLine },
  { key: "routine", Icon: Sparkles },
];

export function PlansScreen() {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { goBack } = useAppNav();

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
              {t("plans.hero_title")}
            </Text>
            <HeroDivider style={styles.heroDivider} />
            <Text style={[styles.heroBody, { color: colors.textSecondary }]}>
              {t("plans.hero_body")}
            </Text>
          </HeroPanel>

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

          <Text style={[styles.note, { color: colors.textMuted }]}>
            {t("plans.not_available")}
          </Text>
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
