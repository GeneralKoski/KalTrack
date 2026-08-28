import { i18n } from "@/src/i18n";
import { theme } from "@/src/styles";
import {
  BottomTabBar,
  createBottomTabNavigator,
  type BottomTabBarProps,
  type BottomTabNavigationOptions,
} from "@react-navigation/bottom-tabs";
import {
  createStaticNavigation,
  type StaticParamList,
} from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { HomeIcon } from "lucide-react-native";
import React from "react";
import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Text } from "@/src/components/ui";
import { HomeScreen } from "@/src/navigation/screens/HomeScreen";

const TAB_BAR_CONTENT_HEIGHT = Platform.select({
  ios: 50,
  default: 60,
});

function TabBar(props: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const bottomInsets = insets.bottom + 6;

  return (
    <BottomTabBar
      {...props}
      insets={{ top: 0, bottom: bottomInsets, left: 0, right: 0 }}
      style={{ height: TAB_BAR_CONTENT_HEIGHT + bottomInsets }}
    />
  );
}

// ─── Tab navigator ────────────────────────────────────────────────────────────

const Tab = createBottomTabNavigator({
  tabBar: (props) => <TabBar {...props} />,
  screenOptions: {
    headerShown: false,
    tabBarShowLabel: true,
    tabBarActiveTintColor: theme.colors.primary,
    tabBarInactiveTintColor: theme.colors.gray400,
    tabBarLabel: ({ color, children }) => (
      <Text
        numberOfLines={1}
        style={{
          fontWeight: "500",
          fontSize: 11,
          color,
          marginTop: 2,
          overflow: "visible",
        }}
      >
        {children}
      </Text>
    ),
    tabBarItemStyle: {
      paddingVertical: 3,
    },
    tabBarStyle: {
      backgroundColor: theme.colors.white,
      borderTopWidth: 1,
      borderTopColor: theme.colors.gray100,
    },
  } satisfies BottomTabNavigationOptions,
  screens: {
    Home: {
      screen: HomeScreen,
      linking: { path: "home" },
      options: {
        title: i18n.t("home"),
        tabBarIcon: ({ color, focused }) =>
          focused ? (
            <HomeIcon color={color} size={24} strokeWidth={2.5} />
          ) : (
            <HomeIcon color={color} size={24} />
          ),
      },
    },
  },
});

// ─── Root stack ───────────────────────────────────────────────────────────────

const RootStack = createNativeStackNavigator({
  screenOptions: { headerShown: false },
  screens: {
    Tabs: {
      screen: Tab,
      linking: { path: "" },
    },
  },
});

// ─── Export ───────────────────────────────────────────────────────────────────

export const Navigation = createStaticNavigation(RootStack);

export type RootStackParamList = StaticParamList<typeof RootStack>;

declare global {
  namespace ReactNavigation {
    // Augmentation di React Navigation: l'interfaccia deve estendere
    // RootStackParamList e resta senza membri propri finché nessuna schermata
    // ha parametri. I parametri delle singole rotte si dichiarano qui.
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface RootParamList extends RootStackParamList {}
  }
}
