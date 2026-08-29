import { ASSISTANT_FAB_CLEARANCE } from "@/src/containers/assistant/AssistantButton";
import {
  EmptyState,
  MetalSurface,
  ScreenBackground,
  SearchBar,
} from "@/src/components/kal";
import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import { FoodListItem } from "@/src/containers/foods/FoodListItem";
import { searchFoods, toggleFoodFavorite } from "@/src/db/queries/foods";
import { useAppNav } from "@/src/hooks/useAppNav";
import { useFocusData } from "@/src/hooks/useFocusData";
import { useTranslation } from "@/src/hooks/useTranslation";
import { theme } from "@/src/styles";
import type { FoodRow } from "@/src/types/nutrition";
import { ChevronLeft, Plus, Salad } from "lucide-react-native";
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, TouchableOpacity, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

const SEARCH_DEBOUNCE_MS = 250;

export function FoodsScreen() {
  const { t } = useTranslation();
  const { navigate, goBack } = useAppNav();
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const timeout = setTimeout(() => setDebounced(term), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [term]);

  const loader = useCallback(() => searchFoods(debounced), [debounced]);
  const { data, loading, reload } = useFocusData<FoodRow[]>(loader);


  const onToggleFavorite = async (id: string) => {
    await toggleFoodFavorite(id);
    reload();
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
          <FlatList
            data={data ?? []}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <FoodListItem
                food={item}
                onPress={() => navigate("FoodForm", { id: item.id })}
                onToggleFavorite={() => onToggleFavorite(item.id)}
              />
            )}
            contentContainerStyle={[
              styles.list,
              { paddingBottom: insets.bottom + ASSISTANT_FAB_CLEARANCE },
            ]}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            keyboardShouldPersistTaps="handled"
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
        style={[styles.fab, { bottom: insets.bottom + theme.spacing.lg }]}
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
