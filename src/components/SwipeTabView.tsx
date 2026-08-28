import { Text } from "@/src/components/ui";
import { theme } from "@/src/styles";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  type LayoutChangeEvent,
  Pressable,
  ScrollView,
  type StyleProp,
  StyleSheet,
  View,
  type ViewStyle,
  useWindowDimensions,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

export interface SwipeTab {
  key: string;
  label: string;
  icon?: React.ReactNode;
}

interface SwipeTabViewProps {
  tabs: SwipeTab[];
  index: number;
  onIndexChange: (index: number) => void;
  renderPage: (tab: SwipeTab, index: number) => React.ReactNode;
  // Stile del contentContainer della ScrollView di ciascuna pagina.
  pageStyle?: StyleProp<ViewStyle>;
}

const ANIM = { duration: 220 } as const;
const VELOCITY_THRESHOLD = 500;

export function SwipeTabView({
  tabs,
  index,
  onIndexChange,
  renderPage,
  pageStyle,
}: SwipeTabViewProps) {
  const { width: windowWidth } = useWindowDimensions();
  const [pagerWidth, setPagerWidth] = useState(0);
  const pageWidth = pagerWidth || windowWidth;
  const count = tabs.length;

  const scrollRef = useRef<ScrollView>(null);

  // Posizione in "unita' di pagina" (float durante lo swipe): guida sia lo
  // scorrimento del contenuto sia l'indicatore.
  const progress = useSharedValue(index);
  const startProgress = useSharedValue(index);

  // Layout misurato di ciascun tab (x/width) per far scorrere l'indicatore.
  const [layouts, setLayouts] = useState<{ x: number; w: number }[]>([]);

  // Pagine effettivamente montate. Le pagine possono contenere liste lunghe non
  // virtualizzate (es. lo storico movimenti del marittimo): montarle tutte
  // all'apertura rallenta il primo render di schermate che ne hanno 5, quindi al
  // primo paint si monta solo la pagina attiva.
  const [mounted, setMounted] = useState<Set<number>>(() => new Set([index]));
  // Il montaggio avviene DOPO il commit, non durante il render: il render
  // corrente disegna lo spinner della pagina, che così fa in tempo a comparire
  // mentre la pagina (costosa) si monta. Insieme alla pagina attiva si montano
  // le adiacenti, che devono essere pronte quando lo swipe le scopre.
  useEffect(() => {
    setMounted((prev) => {
      const next = new Set(prev);
      for (const i of [index - 1, index, index + 1]) {
        if (i >= 0 && i < count) next.add(i);
      }
      return next.size === prev.size ? prev : next;
    });
  }, [index, count]);

  useEffect(() => {
    progress.value = withTiming(index, ANIM);
    const l = layouts[index];
    if (l) {
      scrollRef.current?.scrollTo({ x: Math.max(0, l.x - 40), animated: true });
    }
  }, [index, progress, layouts]);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-12, 12])
        .failOffsetY([-12, 12])
        .onBegin(() => {
          startProgress.value = progress.value;
        })
        .onUpdate((e) => {
          const raw = startProgress.value - e.translationX / pageWidth;
          progress.value = Math.min(Math.max(raw, 0), count - 1);
        })
        .onEnd((e) => {
          let target = Math.round(progress.value);
          if (e.velocityX < -VELOCITY_THRESHOLD) target = Math.ceil(progress.value);
          else if (e.velocityX > VELOCITY_THRESHOLD) target = Math.floor(progress.value);
          target = Math.min(Math.max(target, 0), count - 1);
          progress.value = withTiming(target, ANIM);
          scheduleOnRN(onIndexChange, target);
        }),
    [count, pageWidth, onIndexChange, progress, startProgress],
  );

  const rowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -progress.value * pageWidth }],
  }));

  const measured = layouts.length === count && layouts.every(Boolean);
  const xs = measured ? layouts.map((l) => l.x) : [];
  const ws = measured ? layouts.map((l) => l.w) : [];
  const input = layouts.map((_, i) => i);

  const indicatorStyle = useAnimatedStyle(() => {
    if (!measured) return { opacity: 0 };
    return {
      opacity: 1,
      width: interpolate(progress.value, input, ws, Extrapolation.CLAMP),
      transform: [
        { translateX: interpolate(progress.value, input, xs, Extrapolation.CLAMP) },
      ],
    };
  });

  const onTabLayout = (i: number) => (e: LayoutChangeEvent) => {
    const { x, width } = e.nativeEvent.layout;
    setLayouts((prev) => {
      const next = prev.slice();
      next[i] = { x, w: width };
      return next;
    });
  };

  return (
    <View style={styles.root}>
      <View style={styles.tabBar}>
        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
        >
          <View style={styles.tabBarInner}>
            {tabs.map((item, i) => {
              const active = i === index;
              const color = active ? theme.colors.brand900 : theme.colors.gray400;
              return (
                <Pressable
                  key={item.key}
                  onLayout={onTabLayout(i)}
                  onPress={() => onIndexChange(i)}
                  style={styles.tabItem}
                >
                  {React.isValidElement<{ color?: string }>(item.icon)
                    ? React.cloneElement(item.icon, { color })
                    : item.icon}
                  <Text style={[styles.tabLabel, { color }]}>{item.label}</Text>
                </Pressable>
              );
            })}
            <Animated.View style={[styles.indicator, indicatorStyle]} />
          </View>
        </ScrollView>
      </View>

      <GestureDetector gesture={pan}>
        <View
          style={styles.pager}
          onLayout={(e) => setPagerWidth(e.nativeEvent.layout.width)}
        >
          <Animated.View
            style={[styles.row, { width: pageWidth * count }, rowStyle]}
          >
            {tabs.map((item, i) => (
              <View key={item.key} style={{ width: pageWidth }}>
                <ScrollView
                  contentContainerStyle={pageStyle}
                  showsVerticalScrollIndicator={false}
                >
                  {mounted.has(i) ? (
                    renderPage(item, i)
                  ) : (
                    <View style={styles.pageLoader}>
                      <ActivityIndicator color={theme.colors.primary} />
                    </View>
                  )}
                </ScrollView>
              </View>
            ))}
          </Animated.View>
        </View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  tabBar: {
    backgroundColor: theme.colors.white,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.gray100,
  },
  tabBarInner: {
    flexDirection: "row",
    position: "relative",
    paddingHorizontal: theme.spacing.md,
  },
  tabItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  tabLabel: { fontSize: 15, fontWeight: "600" },
  indicator: {
    position: "absolute",
    left: 0,
    bottom: 0,
    height: 2,
    backgroundColor: theme.colors.brand900,
  },
  pager: { flex: 1, overflow: "hidden" },
  row: { flex: 1, flexDirection: "row" },
  pageLoader: { paddingVertical: theme.spacing.xl, alignItems: "center" },
});
