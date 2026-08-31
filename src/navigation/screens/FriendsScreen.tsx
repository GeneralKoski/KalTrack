import { hasBackend } from "@/src/api/config";
import * as social from "@/src/api/social";
import { DfButton } from "@/src/components/form/DfButton";
import {
  Card,
  EmptyState,
  ScreenBackground,
  SearchBar,
  SectionLabel,
} from "@/src/components/kal";
import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import { FormScreen } from "@/src/components/FormScreen";
import { AccountForm } from "@/src/containers/social/AccountForm";
import { useAppNav } from "@/src/hooks/useAppNav";
import { useFocusData } from "@/src/hooks/useFocusData";
import { useTranslation } from "@/src/hooks/useTranslation";
import { useAccountStore } from "@/src/stores/accountStore";
import { theme } from "@/src/styles";
import { logger } from "@/src/utils/logger";
import { showToast } from "@/src/utils/toast";
import { Check, ChevronLeft, UserPlus, Users, X } from "lucide-react-native";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

const SEARCH_DEBOUNCE_MS = 300;

/** Sotto due caratteri il server non cerca: inutile chiederglielo. */
const MIN_SEARCH_LEN = 2;

/**
 * Amici: ricerca, richieste e chi c'e' gia'.
 *
 * Le richieste in ENTRATA stanno in cima, sopra gli amici: sono l'unica cosa
 * in questa schermata che aspetta una risposta, e chi apre "Amici" dopo una
 * notifica sta cercando quella.
 */
export function FriendsScreen() {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { goBack, navigate } = useAppNav();

  const token = useAccountStore((s) => s.token);
  const isHydrated = useAccountStore((s) => s.isHydrated);

  const [term, setTerm] = useState("");
  const [results, setResults] = useState<social.FoundUser[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const loader = useCallback(
    () => (token ? social.listFriendships() : Promise.resolve([])),
    [token],
  );
  const { data, loading, reload } = useFocusData<social.Friendship[]>(loader);

  // La ricerca parte da sola dopo una pausa di battitura: un bottone "cerca"
  // in piu' da premere, per una lista che si aggiorna in un attimo, e' solo un
  // gesto che l'utente deve ricordarsi di fare.
  useEffect(() => {
    const trimmed = term.trim();
    if (trimmed.length < MIN_SEARCH_LEN) {
      setResults(null);
      return;
    }
    let active = true;
    setSearching(true);
    const handle = setTimeout(() => {
      social
        .searchUsers(trimmed)
        .then((found) => {
          if (active) setResults(found);
        })
        .catch((error) => {
          logger.warn("[social] ricerca non riuscita", error);
          if (active) setResults([]);
        })
        .finally(() => {
          if (active) setSearching(false);
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      active = false;
      clearTimeout(handle);
    };
  }, [term]);

  const act = async (action: () => Promise<unknown>, id: number | null) => {
    setBusyId(id);
    try {
      await action();
      reload();
      // La ricerca a schermo diventa stantia appena cambia un'amicizia: il
      // pulsante "Aggiungi" resterebbe su chi hai appena aggiunto.
      setTerm("");
      setResults(null);
    } catch (error) {
      logger.warn("[social] azione non riuscita", error);
      showToast.error({ title: t("social.action_failed") });
    } finally {
      setBusyId(null);
    }
  };

  const incoming = (data ?? []).filter(
    (f) => f.status === "pending" && f.direction === "incoming",
  );
  const outgoing = (data ?? []).filter(
    (f) => f.status === "pending" && f.direction === "outgoing",
  );
  const friends = (data ?? []).filter((f) => f.status === "accepted");

  const personRow = (
    key: string,
    name: string,
    handle: string,
    right: React.ReactNode,
  ) => (
    <Card
      key={key}
      onPress={() => navigate("FriendProfile", { handle })}
      style={styles.row}
    >
      <View style={styles.person}>
        <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
          {name}
        </Text>
        <Text style={[styles.handle, { color: colors.textMuted }]} numberOfLines={1}>
          @{handle}
        </Text>
      </View>
      {right}
    </Card>
  );

  const iconButton = (
    icon: React.ReactNode,
    onPress: () => void,
    disabled: boolean,
  ) => (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.6}
      hitSlop={8}
      disabled={disabled}
      style={styles.iconButton}
    >
      {icon}
    </TouchableOpacity>
  );

  const body = () => {
    if (!hasBackend()) {
      return (
        <EmptyState
          message={t("social.no_backend")}
          icon={<Users size={40} color={colors.textFaint} />}
        />
      );
    }
    if (!isHydrated) {
      return <ActivityIndicator style={styles.loader} color={colors.accent} />;
    }
    if (!token) return <AccountForm />;

    return (
      <>
        <SearchBar
          value={term}
          onChangeText={setTerm}
          placeholder={t("social.search_placeholder")}
        />

        {searching ? (
          <ActivityIndicator style={styles.searching} color={colors.accent} />
        ) : null}

        {results !== null && !searching ? (
          <>
            <SectionLabel style={styles.section}>
              {t("social.results")}
            </SectionLabel>
            {results.length === 0 ? (
              <Text style={[styles.hint, { color: colors.textMuted }]}>
                {t("social.no_results")}
              </Text>
            ) : (
              results.map((user) =>
                personRow(
                  `found-${user.handle}`,
                  user.displayName,
                  user.handle,
                  user.isFriend ? (
                    <Text style={[styles.badge, { color: colors.textMuted }]}>
                      {t("social.already_friend")}
                    </Text>
                  ) : (
                    iconButton(
                      <UserPlus size={20} color={colors.accent} />,
                      () =>
                        void act(
                          () => social.requestFriendship(user.handle),
                          null,
                        ),
                      busyId !== null,
                    )
                  ),
                ),
              )
            )}
          </>
        ) : null}

        {loading && !data ? (
          <ActivityIndicator style={styles.loader} color={colors.accent} />
        ) : null}

        {incoming.length > 0 ? (
          <>
            <SectionLabel style={styles.section}>
              {t("social.incoming")}
            </SectionLabel>
            {incoming.map((f) =>
              personRow(
                `in-${f.id}`,
                f.user?.displayName ?? "",
                f.user?.handle ?? "",
                <View style={styles.actions}>
                  {iconButton(
                    <Check size={20} color={colors.accent} />,
                    () => void act(() => social.acceptFriendship(f.id), f.id),
                    busyId !== null,
                  )}
                  {iconButton(
                    <X size={20} color={colors.textMuted} />,
                    () => void act(() => social.removeFriendship(f.id), f.id),
                    busyId !== null,
                  )}
                </View>,
              ),
            )}
          </>
        ) : null}

        <SectionLabel style={styles.section}>{t("social.friends")}</SectionLabel>
        {friends.length === 0 ? (
          <Text style={[styles.hint, { color: colors.textMuted }]}>
            {t("social.no_friends")}
          </Text>
        ) : (
          friends.map((f) =>
            personRow(
              `fr-${f.id}`,
              f.user?.displayName ?? "",
              f.user?.handle ?? "",
              iconButton(
                <X size={18} color={colors.textFaint} />,
                () => void act(() => social.removeFriendship(f.id), f.id),
                busyId !== null,
              ),
            ),
          )
        )}

        {outgoing.length > 0 ? (
          <>
            <SectionLabel style={styles.section}>
              {t("social.outgoing")}
            </SectionLabel>
            {outgoing.map((f) =>
              personRow(
                `out-${f.id}`,
                f.user?.displayName ?? "",
                f.user?.handle ?? "",
                iconButton(
                  <X size={18} color={colors.textFaint} />,
                  () => void act(() => social.removeFriendship(f.id), f.id),
                  busyId !== null,
                ),
              ),
            )}
          </>
        ) : null}

        {token && friends.length > 0 ? (
          <DfButton
            label={t("social.compare")}
            variant="outlined"
            onPress={() => navigate("Comparison")}
            style={styles.section}
          />
        ) : null}

        {token ? (
          <DfButton
            label={t("social.my_profile")}
            variant="outlined"
            onPress={() => navigate("MyProfile")}
            style={styles.section}
          />
        ) : null}
      </>
    );
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
            {t("social.title")}
          </Text>
        </View>

        <FormScreen
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + theme.spacing.lg },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {body()}
        </FormScreen>
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
  title: { flex: 1, fontSize: 24, fontWeight: "700" },
  content: { padding: theme.spacing.md, gap: theme.spacing.sm },
  loader: { marginTop: theme.spacing.xl },
  searching: { marginTop: theme.spacing.sm },
  section: { marginTop: theme.spacing.md },
  row: { flexDirection: "row", alignItems: "center", gap: theme.spacing.sm },
  person: { flex: 1, gap: 2 },
  name: { fontSize: 15, fontWeight: "600" },
  handle: { fontSize: 13 },
  hint: { fontSize: 13, lineHeight: 18 },
  badge: { fontSize: 12, fontWeight: "600" },
  actions: { flexDirection: "row", gap: theme.spacing.sm },
  iconButton: { padding: 4 },
});
