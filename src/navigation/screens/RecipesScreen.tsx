import {
  EmptyState,
  MetalSurface,
  ScreenBackground,
  SearchBar,
} from "@/src/components/kal";
import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import { RecipeListItem } from "@/src/containers/recipes/RecipeListItem";
import {
  buildRecipeTree,
  getRecipeItems,
  searchRecipes,
  toggleRecipeFavorite,
} from "@/src/db/queries/recipes";
import { recipePerServing } from "@/src/domain/nutrition";
import { useAppNav } from "@/src/hooks/useAppNav";
import { useFocusData } from "@/src/hooks/useFocusData";
import { useTranslation } from "@/src/hooks/useTranslation";
import { theme } from "@/src/styles";
import type { RecipeRow } from "@/src/types/nutrition";
import { CookingPot, Plus } from "lucide-react-native";
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

interface RecipeListEntry {
  recipe: RecipeRow;
  kcalPerServing: number;
  ingredientCount: number;
}

export function RecipesScreen() {
  const { t } = useTranslation();
  const { navigate } = useAppNav();
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const timeout = setTimeout(() => setDebounced(term), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [term]);

  const loader = useCallback(async (): Promise<RecipeListEntry[]> => {
    const rows = await searchRecipes(debounced);
    return Promise.all(
      rows.map(async (recipe) => {
        const [tree, items] = await Promise.all([
          buildRecipeTree(recipe.id),
          getRecipeItems(recipe.id),
        ]);
        return {
          recipe,
          kcalPerServing: tree ? recipePerServing(tree).kcal : 0,
          ingredientCount: items.length,
        };
      }),
    );
  }, [debounced]);

  const { data, loading, reload } = useFocusData<RecipeListEntry[]>(loader);

  useEffect(() => {
    reload();
  }, [debounced, reload]);

  const onToggleFavorite = async (id: string) => {
    await toggleRecipeFavorite(id);
    reload();
  };

  return (
    <View style={styles.root}>
      <ScreenBackground />
      <SafeAreaView edges={["top", "left", "right"]} style={styles.safe}>
        <Text style={[styles.title, { color: colors.text }]}>
          {t("recipes.title")}
        </Text>

        <View style={styles.searchWrap}>
          <SearchBar
            value={term}
            onChangeText={setTerm}
            placeholder={t("recipes.search_placeholder")}
          />
        </View>

        {loading && !data ? (
          <ActivityIndicator style={styles.loader} color={colors.accent} />
        ) : (
          <FlatList
            data={data ?? []}
            keyExtractor={(item) => item.recipe.id}
            renderItem={({ item }) => (
              <RecipeListItem
                recipe={item.recipe}
                kcalPerServing={item.kcalPerServing}
                ingredientCount={item.ingredientCount}
                onPress={() => navigate("RecipeForm", { id: item.recipe.id })}
                onToggleFavorite={() => onToggleFavorite(item.recipe.id)}
              />
            )}
            contentContainerStyle={[
              styles.list,
              { paddingBottom: insets.bottom + 96 },
            ]}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <EmptyState
                message={t("recipes.empty")}
                icon={<CookingPot size={40} color={colors.textFaint} />}
              />
            }
          />
        )}
      </SafeAreaView>

      <TouchableOpacity
        style={[styles.fab, { bottom: insets.bottom + theme.spacing.lg }]}
        activeOpacity={0.6}
        onPress={() => navigate("RecipeForm", {})}
      >
        <MetalSurface radius={28} style={styles.fabSurface}>
          <Plus size={26} color={colors.text} strokeWidth={2.5} />
        </MetalSurface>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  title: {
    fontSize: 24,
    fontWeight: "700",
    paddingHorizontal: theme.spacing.md,
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
    width: 56,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
  },
});
