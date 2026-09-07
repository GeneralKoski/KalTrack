import {
  DateRangeField,
  EmptyState,
  ListGroup,
  ScreenBackground,
  SectionLabel,
  Segmented,
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

/** Il tondo della spunta e lo spazio fra lui e il nome. */
const BOX_SIZE = 20;
const ROW_GAP = theme.spacing.sm + 4;

/** Il separatore parte dove finisce il tondo, non dal bordo del blocco. */
const ROW_INDENT = theme.spacing.md + BOX_SIZE + ROW_GAP;

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
  const toBuy = items.filter((item) => !taken.has(item.foodId));
  const bought = items.filter((item) => taken.has(item.foodId));
  const takenCount = bought.length;

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

  const renderRow = (item: ShoppingItem, checked: boolean) => (
    <TouchableOpacity
      key={item.foodId}
      onPress={() => toggle(item.foodId)}
      activeOpacity={0.6}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      style={styles.row}
    >
      <View
        style={[
          styles.box,
          checked
            ? { backgroundColor: colors.accent, borderColor: colors.accent }
            : { borderColor: colors.border },
        ]}
      >
        {checked ? <Check size={13} color={colors.accentOn} /> : null}
      </View>

      <Text
        style={[
          styles.name,
          {
            color: checked ? colors.textFaint : colors.text,
            textDecorationLine: checked ? "line-through" : "none",
          },
        ]}
        numberOfLines={1}
      >
        {item.name}
      </Text>

      {/* La quantità non si restringe: è il dato per cui si legge la riga.
          A restringersi è il nome. */}
      <Text
        style={[
          styles.quantity,
          { color: checked ? colors.textFaint : colors.textSecondary },
        ]}
        numberOfLines={1}
      >
        {formatQuantity(item.grams)}
      </Text>
    </TouchableOpacity>
  );

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

        {/*
          Quattro periodi fissi: un controllo a segmenti, non dei chip che
          scorrono. Scorrendo, "Prossima settimana" si tagliava a "Pross..." e
          il quarto periodo stava mezzo fuori schermo - in un selettore, dove il
          punto e' vedere le alternative.
        */}
        <View style={styles.ranges}>
          <Segmented
            value={activeKey ?? "rest_of_week"}
            onChange={selectRange}
            options={RANGES.map((key) => ({
              value: key,
              label: t(`shopping.range_${key}`),
            }))}
          />
        </View>

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
                {/*
                  Quel che resta da comprare sta in cima e da solo: mescolato ai
                  presi, in mezzo al reparto si rileggeva ogni volta tutta la
                  lista per capire cosa mancava.
                */}
                {toBuy.length > 0 ? (
                  <>
                    <SectionLabel
                      style={styles.section}
                      right={
                        <Text
                          style={[styles.counter, { color: colors.textFaint }]}
                        >
                          {t("shopping.taken", {
                            done: takenCount,
                            total: items.length,
                          })}
                        </Text>
                      }
                    >
                      {t("shopping.to_buy")}
                    </SectionLabel>
                    <ListGroup indent={ROW_INDENT}>
                      {toBuy.map((item) => renderRow(item, false))}
                    </ListGroup>
                  </>
                ) : (
                  // Con tutto preso la sezione "Da comprare" sparirebbe e
                  // resterebbe solo l'elenco dei presi: sembrerebbe che la
                  // lista si sia svuotata da sola.
                  <EmptyState
                    compact
                    message={t("shopping.all_taken")}
                    icon={<Check size={32} color={colors.textFaint} />}
                  />
                )}

                {bought.length > 0 ? (
                  <>
                    <SectionLabel style={styles.section}>
                      {t("shopping.bought")}
                    </SectionLabel>
                    <ListGroup indent={ROW_INDENT}>
                      {bought.map((item) => renderRow(item, true))}
                    </ListGroup>
                  </>
                ) : null}

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
  ranges: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 4,
  },
  customDateContainer: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.xs,
    paddingBottom: theme.spacing.xs,
  },
  content: {
    paddingHorizontal: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  section: { marginTop: theme.spacing.sm },
  counter: { fontSize: 12, fontWeight: "500" },
  row: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: ROW_GAP,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  box: {
    width: BOX_SIZE,
    height: BOX_SIZE,
    // Tondo e non quadrato: e' una spunta che si toglie e si rimette, come
    // quella delle serie in palestra, non una casella di un modulo.
    borderRadius: theme.radius.full,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  name: { flex: 1, flexShrink: 1, fontSize: 15, fontWeight: "500" },
  quantity: { fontSize: 14, fontWeight: "700" },
  hint: { fontSize: 12, marginTop: theme.spacing.xs },
  loader: { marginTop: theme.spacing.xl },
});
