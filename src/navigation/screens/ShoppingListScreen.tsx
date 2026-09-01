import {
  Card,
  DateRangeField,
  EmptyState,
  ScreenBackground,
} from "@/src/components/kal";
import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import { planToShoppingList } from "@/src/db/queries/mealPlan";
import { addDays, startOfWeek, todayIso, toIsoDate } from "@/src/domain/date";
import { formatQuantity, type ShoppingItem } from "@/src/domain/shoppingList";
import { useAppNav } from "@/src/hooks/useAppNav";
import { useFocusData } from "@/src/hooks/useFocusData";
import { useTranslation } from "@/src/hooks/useTranslation";
import { theme } from "@/src/styles";
import { useRoute, type RouteProp } from "@react-navigation/native";
import { Check, ChevronLeft, ShoppingCart } from "lucide-react-native";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

type RangeKey = "rest_of_week" | "this_week" | "next_week" | "custom";

const RANGES: RangeKey[] = ["rest_of_week", "this_week", "next_week", "custom"];

interface ShoppingRouteParams {
  from?: string;
  to?: string;
}

const parseIso = (iso: string): Date => {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
};

/** Estremi dell'intervallo predefinito, calcolati sul giorno corrente. */
function rangeDates(
  key: "rest_of_week" | "this_week" | "next_week",
  today: string,
): [string, string] {
  const monday = startOfWeek(today);
  const sunday = addDays(monday, 6);
  if (key === "rest_of_week") return [today, sunday];
  if (key === "this_week") return [monday, sunday];
  const nextMonday = addDays(monday, 7);
  return [nextMonday, addDays(nextMonday, 6)];
}

export function ShoppingListScreen() {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const { goBack } = useAppNav();
  const insets = useSafeAreaInsets();
  const route =
    useRoute<RouteProp<Record<string, ShoppingRouteParams>, string>>();
  const today = todayIso();

  const initialRange =
    route.params?.from && route.params?.to
      ? ([route.params.from, route.params.to] as [string, string])
      : rangeDates("rest_of_week", today);

  const [range, setRange] = useState<[string, string]>(initialRange);
  const [activeKey, setActiveKey] = useState<RangeKey | null>(
    route.params?.from ? "custom" : "rest_of_week",
  );

  /**
   * Le spunte vivono solo qui, in memoria: sono una sessione di spesa, non un
   * dato da conservare. Chiusa la schermata la lista si rifà dal piano, e un
   * "preso" di tre settimane fa non significherebbe più niente.
   */
  const [taken, setTaken] = useState<Set<string>>(new Set());

  const loader = useCallback(
    () => planToShoppingList(range[0], range[1]),
    [range],
  );
  const { data, loading } = useFocusData<ShoppingItem[]>(loader);

  const items = data ?? [];
  const takenCount = items.filter((item) => taken.has(item.foodId)).length;

  const toggle = (foodId: string) => {
    setTaken((current) => {
      const next = new Set(current);
      if (next.has(foodId)) next.delete(foodId);
      else next.add(foodId);
      return next;
    });
  };

  const selectRange = (key: RangeKey) => {
    setActiveKey(key);
    if (key !== "custom") {
      setRange(rangeDates(key, today));
    }
  };

  const handleDateChangeFrom = (d: Date) => {
    const fromIso = toIsoDate(d);
    setActiveKey("custom");
    setRange(([_, to]) => [fromIso, to < fromIso ? fromIso : to]);
  };

  const handleDateChangeTo = (d: Date) => {
    const toIso = toIsoDate(d);
    setActiveKey("custom");
    setRange(([from, _]) => [from > toIso ? toIso : from, toIso]);
  };

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
            {t("shopping.title")}
          </Text>
          {taken.size > 0 ? (
            <TouchableOpacity
              onPress={() => setTaken(new Set())}
              activeOpacity={0.6}
              hitSlop={10}
            >
              <Text style={[styles.reset, { color: colors.accent }]}>
                {t("shopping.reset")}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          style={styles.rangesScroll}
          contentContainerStyle={styles.ranges}
        >
          {RANGES.map((key) => {
            const active = key === activeKey;
            return (
              <TouchableOpacity
                key={key}
                onPress={() => selectRange(key)}
                activeOpacity={0.6}
                style={[
                  styles.rangeChip,
                  {
                    backgroundColor: active
                      ? colors.accent
                      : colors.surfaceMuted,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.rangeLabel,
                    { color: active ? colors.accentOn : colors.textMuted },
                  ]}
                  numberOfLines={1}
                >
                  {t(`shopping.range_${key}`)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {activeKey === "custom" ? (
          <View style={styles.customDateContainer}>
            <DateRangeField
              from={parseIso(range[0])}
              to={parseIso(range[1])}
              onChangeFrom={handleDateChangeFrom}
              onChangeTo={handleDateChangeTo}
            />
          </View>
        ) : null}

        {loading && !data ? (
          <ActivityIndicator style={styles.loader} color={colors.accent} />
        ) : (
          <ScrollView
            contentContainerStyle={[
              styles.content,
              { paddingBottom: insets.bottom + theme.spacing.lg },
            ]}
            keyboardShouldPersistTaps="handled"
          >
            {items.length === 0 ? (
              <EmptyState
                message={t("shopping.empty")}
                icon={<ShoppingCart size={40} color={colors.textFaint} />}
              />
            ) : (
              <>
                <Text style={[styles.counter, { color: colors.textMuted }]}>
                  {t("shopping.taken", {
                    done: takenCount,
                    total: items.length,
                  })}
                </Text>

                <Card style={styles.card}>
                  {items.map((item, index) => {
                    const checked = taken.has(item.foodId);
                    return (
                      <TouchableOpacity
                        key={item.foodId}
                        onPress={() => toggle(item.foodId)}
                        activeOpacity={0.6}
                        style={[
                          styles.row,
                          index > 0 && {
                            borderTopWidth: StyleSheet.hairlineWidth,
                            borderTopColor: colors.border,
                          },
                        ]}
                      >
                        <View
                          style={[
                            styles.box,
                            {
                              borderColor: checked
                                ? colors.accent
                                : colors.border,
                              backgroundColor: checked
                                ? colors.accent
                                : "transparent",
                            },
                          ]}
                        >
                          {checked ? (
                            <Check size={14} color={colors.accentOn} />
                          ) : null}
                        </View>

                        <Text
                          style={[
                            styles.name,
                            {
                              color: checked ? colors.textFaint : colors.text,
                              textDecorationLine: checked
                                ? "line-through"
                                : "none",
                            },
                          ]}
                          numberOfLines={1}
                        >
                          {item.name}
                        </Text>

                        {/* La quantità non si restringe: è il dato per cui si
                            legge la riga. A restringersi è il nome. */}
                        <Text
                          style={[
                            styles.quantity,
                            {
                              color: checked
                                ? colors.textFaint
                                : colors.textSecondary,
                            },
                          ]}
                          numberOfLines={1}
                        >
                          {formatQuantity(item.grams)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </Card>

                <Text style={[styles.hint, { color: colors.textFaint }]}>
                  {t("shopping.session_hint")}
                </Text>
              </>
            )}
          </ScrollView>
        )}
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
  reset: { fontSize: 13, fontWeight: "600" },
  rangesScroll: {
    flexGrow: 0,
  },
  ranges: {
    alignItems: "center",
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 4,
  },
  rangeChip: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 6,
    borderRadius: theme.radius.full,
  },
  rangeLabel: { fontSize: 13, fontWeight: "600" },
  customDateContainer: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.xs,
    paddingBottom: theme.spacing.xs,
  },
  content: {
    paddingHorizontal: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  counter: { fontSize: 13, fontWeight: "600" },
  card: { paddingVertical: 0 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.md,
  },
  box: {
    width: 22,
    height: 22,
    borderRadius: theme.radius.sm,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  name: { flex: 1, flexShrink: 1, fontSize: 15, fontWeight: "500" },
  quantity: { fontSize: 14, fontWeight: "700" },
  hint: { fontSize: 12, marginTop: theme.spacing.xs },
  loader: { marginTop: theme.spacing.xl },
});
