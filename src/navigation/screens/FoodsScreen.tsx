import { SCREEN_FAB_SIZE } from "@/src/containers/assistant/AssistantButton";
import {
  EmptyState,
  MetalSurface,
  ScreenBackground,
  SearchBar,
} from "@/src/components/kal";
import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import { FoodListItem } from "@/src/containers/foods/FoodListItem";
import { OffResultItem } from "@/src/containers/foods/OffResultItem";
import { useOffSearch } from "@/src/containers/foods/useOffSearch";
import { createFood, searchFoods, toggleFoodFavorite } from "@/src/db/queries/foods";
import { useAppNav } from "@/src/hooks/useAppNav";
import { useFocusData } from "@/src/hooks/useFocusData";
import { useTranslation } from "@/src/hooks/useTranslation";
import { theme } from "@/src/styles";
import type { FoodInput, FoodRow } from "@/src/types/nutrition";
import { logger } from "@/src/utils/logger";
import { showToast } from "@/src/utils/toast";
import { ChevronLeft, Plus, Salad } from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  SectionList,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

const SEARCH_DEBOUNCE_MS = 250;

export function FoodsScreen() {
  const { t } = useTranslation();
  const { navigate, goBack } = useAppNav();
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const fabBottom = insets.bottom + theme.spacing.lg;
  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const timeout = setTimeout(() => setDebounced(term), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [term]);

  const loader = useCallback(() => searchFoods(debounced), [debounced]);
  const { data, loading, reload } = useFocusData<FoodRow[]>(loader);

  // Memoizzato e non `data ?? []` inline: un array nuovo a ogni render
  // ricalcolerebbe le sezioni a ogni disegno.
  const locali = useMemo(() => data ?? [], [data]);
  const off = useOffSearch(debounced, locali);

  /*
   * Due sezioni e non una lista sola: un prodotto dell'archivio non e' ancora
   * una voce di questo telefono, e mescolarlo ai propri alimenti lo farebbe
   * sembrare tale. Una sezione compare solo se ha qualcosa da dire - quella
   * dell'archivio anche mentre carica, altrimenti l'attesa non si vede.
   */
  const sections = useMemo(() => {
    const risultato: {
      key: "library" | "off";
      title: string;
      data: (FoodRow | FoodInput)[];
    }[] = [];

    if (locali.length > 0) {
      risultato.push({
        key: "library",
        title: t("foods.section_library"),
        data: locali,
      });
    }
    if (off.results.length > 0 || off.loading) {
      risultato.push({
        key: "off",
        title: t("foods.section_off"),
        data: off.results,
      });
    }
    return risultato;
  }, [locali, off.results, off.loading, t]);

  const onToggleFavorite = async (id: string) => {
    await toggleFoodFavorite(id);
    reload();
  };

  /*
   * Il prodotto si salva e si apre subito nel modulo.
   *
   * Non si aggiunge in silenzio: i valori vengono da un archivio pubblico
   * compilato da chiunque, e la porzione spesso manca del tutto. Aprire il
   * modulo mette sotto gli occhi quel che e' entrato in libreria, nel momento
   * in cui correggerlo costa niente.
   */
  const onImportOff = async (food: FoodInput) => {
    try {
      const id = await createFood({ ...food, source: "off" });
      reload();
      navigate("FoodForm", { id });
    } catch (error) {
      logger.error("[foods] importazione da OpenFoodFacts fallita", error);
      showToast.error({ title: t("foods.off_import_failed") });
    }
  };

  return (
    <View style={styles.root}>
      <ScreenBackground />
      <SafeAreaView edges={["top", "left", "right"]} style={styles.safe}>
        {/* Il tasto indietro c'e' in tutte le altre schermate di secondo
            livello: senza, l'unica via d'uscita era il gesto di sistema. */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={goBack}
            activeOpacity={0.6}
            hitSlop={10}
          >
            <ChevronLeft size={26} color={colors.textSecondary} />
          </TouchableOpacity>
          <Text
            style={[styles.title, { color: colors.text }]}
            numberOfLines={1}
          >
            {t("foods.title")}
          </Text>
        </View>

        <View style={styles.searchWrap}>
          <SearchBar
            value={term}
            onChangeText={setTerm}
            placeholder={t("foods.search_placeholder")}
          />
        </View>

        {loading && !data ? (
          <ActivityIndicator style={styles.loader} color={colors.accent} />
        ) : (
          <SectionList
            sections={sections}
            keyExtractor={(item, index) =>
              "id" in item ? item.id : `off-${item.barcode ?? index}`
            }
            renderItem={({ item }) =>
              "id" in item ? (
                <FoodListItem
                  food={item}
                  onPress={() => navigate("FoodForm", { id: item.id })}
                  onToggleFavorite={() => onToggleFavorite(item.id)}
                />
              ) : (
                <OffResultItem food={item} onPress={() => onImportOff(item)} />
              )
            }
            renderSectionHeader={({ section }) => (
              <View style={styles.sectionHeader}>
                <Text
                  style={[styles.sectionTitle, { color: colors.textFaint }]}
                >
                  {section.title}
                </Text>
                {section.key === "off" && off.loading ? (
                  <ActivityIndicator size="small" color={colors.textFaint} />
                ) : null}
              </View>
            )}
            contentContainerStyle={[
              styles.list,
              { paddingBottom: fabBottom + SCREEN_FAB_SIZE + theme.spacing.md },
            ]}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            keyboardShouldPersistTaps="handled"
            stickySectionHeadersEnabled={false}
            ListEmptyComponent={
              <EmptyState
                message={t("foods.empty")}
                icon={<Salad size={40} color={colors.textFaint} />}
              />
            }
          />
        )}
      </SafeAreaView>

      <TouchableOpacity
        style={[styles.fab, { bottom: fabBottom }]}
        activeOpacity={0.6}
        onPress={() => navigate("FoodForm", {})}
      >
        <MetalSurface radius={28} style={styles.fabSurface}>
          <Plus size={26} color={colors.text} strokeWidth={2.5} />
        </MetalSurface>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  safe: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  title: {
    flex: 1,
    fontSize: 24,
    fontWeight: "700",
    paddingTop: theme.spacing.sm,
  },
  searchWrap: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  list: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.xs,
  },
  separator: {
    height: theme.spacing.sm,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.xs,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  loader: {
    marginTop: theme.spacing.xl,
  },
  fab: {
    position: "absolute",
    right: theme.spacing.md,
    borderRadius: 28,
    shadowColor: theme.colors.gray900,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  fabSurface: {
    width: SCREEN_FAB_SIZE,
    height: SCREEN_FAB_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
});
