import { DfAlert } from "@/src/components/DfAlert";
import { EmptyState, ScreenBackground, SearchBar } from "@/src/components/kal";
import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import { FoodFacts } from "@/src/containers/foods/FoodFacts";
import { FoodListItem } from "@/src/containers/foods/FoodListItem";
import { searchFoods, toggleFoodFavorite } from "@/src/db/queries/foods";
import { useAppNav } from "@/src/hooks/useAppNav";
import { useFocusData } from "@/src/hooks/useFocusData";
import { useTranslation } from "@/src/hooks/useTranslation";
import { syncCatalog } from "@/src/services/catalogSync";
import { theme } from "@/src/styles";
import type { FoodRow } from "@/src/types/nutrition";
import { showToast } from "@/src/utils/toast";
import { ChevronLeft, CloudDownload, Salad } from "lucide-react-native";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

const SEARCH_DEBOUNCE_MS = 250;

/*
 * `searchFoods` ha `limit = 50` di default, che qui taglierebbe il catalogo a
 * un quarto: duecento alimenti di catalogo piu' quelli aggiunti a mano. Una
 * riga che non c'e' perche' il limite l'ha tagliata non si distingue da una
 * riga che il server non ha mandato, ed e' il difetto peggiore in una pagina
 * che serve a controllare cosa e' arrivato.
 */
const CATALOG_LIMIT = 500;

/**
 * Il catalogo degli alimenti, in sola lettura.
 *
 * E' la pagina gemella di `ExercisesScreen` e la ragione per cui esiste sta
 * nell'asimmetria che c'era prima: `ExercisesScreen` legge `searchExercises`,
 * cioe' TUTTI gli esercizi, mentre `FoodsScreen` legge `searchMyFoods`, che
 * esclude i seed. Il bottone del catalogo stava su quest'ultima, dove
 * aggiornava righe che quella schermata non puo' mostrare: si premeva un
 * comando il cui effetto era invisibile dove veniva premuto.
 *
 * Qui non si crea e non si modifica, e non e' una mancanza: scrivere un
 * alimento resta in "I miei alimenti", cosi' l'azione di crearne uno vive in
 * un posto solo. Da qui si guarda cosa c'e' e si aggiorna dal server.
 */
export function FoodCatalogScreen() {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const { goBack } = useAppNav();
  const insets = useSafeAreaInsets();

  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");
  const [importing, setImporting] = useState(false);
  const [detail, setDetail] = useState<FoodRow | null>(null);

  useEffect(() => {
    const timeout = setTimeout(() => setDebounced(term), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [term]);

  const loader = useCallback(
    () => searchFoods(debounced, CATALOG_LIMIT),
    [debounced],
  );
  const { data, loading, reload } = useFocusData<FoodRow[]>(loader);

  const aggiornaCatalogo = async () => {
    setImporting(true);
    try {
      // `true`: chi tocca il bottone ha chiesto il catalogo adesso, e la
      // finestra di un'ora renderebbe questo comando un comando che non fa
      // niente.
      const { toccate, riuscito } = await syncCatalog(true);
      if (!riuscito) {
        showToast.error({ title: t("catalog.sync_failed") });
      } else {
        showToast.success({
          title:
            toccate === 0
              ? t("catalog.up_to_date")
              : t("catalog.updated", { count: toccate }),
        });
        if (toccate > 0) reload();
      }
    } finally {
      setImporting(false);
    }
  };

  const onToggleFavorite = async (id: string) => {
    await toggleFoodFavorite(id);
    reload();
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
            {t("food_catalog.title")}
          </Text>

          {/* Il catalogo si aggiorna a mano e non da solo: e' una lettura dal
              server, e l'app deve restare utilizzabile identica senza rete. */}
          <TouchableOpacity
            onPress={() => void aggiornaCatalogo()}
            activeOpacity={0.6}
            hitSlop={10}
            disabled={importing}
            accessibilityRole="button"
            accessibilityLabel={t("foods.import_catalog")}
          >
            <CloudDownload
              size={22}
              color={importing ? colors.textFaint : colors.textSecondary}
            />
          </TouchableOpacity>
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
          <FlatList
            data={data ?? []}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <FoodListItem
                food={item}
                onPress={() => setDetail(item)}
                onToggleFavorite={() => void onToggleFavorite(item.id)}
              />
            )}
            contentContainerStyle={[
              styles.list,
              { paddingBottom: insets.bottom + theme.spacing.lg },
            ]}
            ItemSeparatorComponent={() => (
              <View
                style={[styles.separator, { backgroundColor: colors.border }]}
              />
            )}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <EmptyState
                message={t("food_catalog.empty")}
                icon={<Salad size={40} color={colors.textFaint} />}
              />
            }
          />
        )}
      </SafeAreaView>

      {/* Gli stessi valori per 100 g che mostra il foglio Aggiungi: la
          domanda che si fa qui e' la stessa, e una seconda resa sarebbe due
          pannelli da tenere allineati a mano. */}
      <DfAlert
        isOpen={detail !== null}
        title={detail?.name}
        confirmLabel={t("close")}
        hideCancel
        onConfirm={() => setDetail(null)}
        onClose={() => setDetail(null)}
      >
        {detail ? <FoodFacts food={detail} /> : null}
      </DfAlert>
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
  searchWrap: {
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
  },
  list: { paddingHorizontal: theme.spacing.md },
  separator: { height: StyleSheet.hairlineWidth },
  loader: { marginTop: theme.spacing.xl },
});
