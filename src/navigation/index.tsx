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
  DarkTheme,
  DefaultTheme,
  type StaticParamList,
} from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { CalendarDays, Dumbbell, TrendingUp, User } from "lucide-react-native";
import React, { useMemo } from "react";
import { Platform, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAppTheme } from "@/src/components/ThemeContext";
import type { RoutineInput } from "@/src/db/queries/workouts";
import { ONBOARDING_STEPS } from "@/src/domain/onboarding";
import { navigationRef } from "@/src/navigation/navigationRef";
import { OnboardingStack } from "@/src/navigation/onboardingStack";
import { useOnboardingStore } from "@/src/stores/onboardingStore";
import { Text } from "@/src/components/ui";
import { AchievementsScreen } from "@/src/navigation/screens/AchievementsScreen";
import { AdminScreen } from "@/src/navigation/screens/AdminScreen";
import { AppearanceScreen } from "@/src/navigation/screens/AppearanceScreen";
import { BackupScreen } from "@/src/navigation/screens/BackupScreen";
import { ComparisonScreen } from "@/src/navigation/screens/ComparisonScreen";
import { DiagnosticsScreen } from "@/src/navigation/screens/DiagnosticsScreen";
import { ExerciseDetailScreen } from "@/src/navigation/screens/ExerciseDetailScreen";
import { EquipmentScreen } from "@/src/navigation/screens/EquipmentScreen";
import { ExercisesScreen } from "@/src/navigation/screens/ExercisesScreen";
import { FriendProfileScreen } from "@/src/navigation/screens/FriendProfileScreen";
import { FriendsScreen } from "@/src/navigation/screens/FriendsScreen";
import { GenerateRoutineScreen } from "@/src/navigation/screens/GenerateRoutineScreen";
import { MyProfileScreen } from "@/src/navigation/screens/MyProfileScreen";
import { MealPlanScreen } from "@/src/navigation/screens/MealPlanScreen";
import { HealthScreen } from "@/src/navigation/screens/HealthScreen";
import { LanguageScreen } from "@/src/navigation/screens/LanguageScreen";
import { MealTypesScreen } from "@/src/navigation/screens/MealTypesScreen";
import { MeasurementsScreen } from "@/src/navigation/screens/MeasurementsScreen";
import { ProgressPhotosScreen } from "@/src/navigation/screens/ProgressPhotosScreen";
import { RemindersScreen } from "@/src/navigation/screens/RemindersScreen";
import { RoutineFormScreen } from "@/src/navigation/screens/RoutineFormScreen";
import { RoutinesScreen } from "@/src/navigation/screens/RoutinesScreen";
import { SessionScreen } from "@/src/navigation/screens/SessionScreen";
import { ShoppingListScreen } from "@/src/navigation/screens/ShoppingListScreen";
import { StepsHistoryScreen } from "@/src/navigation/screens/StepsHistoryScreen";
import { WeightHistoryScreen } from "@/src/navigation/screens/WeightHistoryScreen";
import { FoodFormScreen } from "@/src/navigation/screens/FoodFormScreen";
import { FoodScanScreen } from "@/src/navigation/screens/FoodScanScreen";
import { FoodsScreen } from "@/src/navigation/screens/FoodsScreen";
import { GymScreen } from "@/src/navigation/screens/GymScreen";
import { RecipeFormScreen } from "@/src/navigation/screens/RecipeFormScreen";
import { RecipesScreen } from "@/src/navigation/screens/RecipesScreen";
import { SettingsScreen } from "@/src/navigation/screens/SettingsScreen";
import { TargetsScreen } from "@/src/navigation/screens/TargetsScreen";
import { ProfileScreen } from "@/src/navigation/screens/ProfileScreen";
import { ProgressScreen } from "@/src/navigation/screens/ProgressScreen";
import { TodayScreen } from "@/src/navigation/screens/TodayScreen";

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

// La label è un componente a sé perché deve leggere il tema con un hook, cosa
// impossibile dentro l'oggetto statico di screenOptions.
function TabLabel({ color, children }: { color: string; children: string }) {
  return (
    <Text numberOfLines={1} style={[styles.tabLabel, { color }]}>
      {children}
    </Text>
  );
}

// ─── Tab navigator ────────────────────────────────────────────────────────────

const Tab = createBottomTabNavigator({
  tabBar: (props) => <TabBar {...props} />,
  screenOptions: {
    headerShown: false,
    tabBarShowLabel: true,
    // Il colore della tab attiva non è impostato qui: screenOptions è un
    // oggetto statico e non può leggere il tema, quindi lo lasciamo ereditare
    // da `colors.primary` del tema di React Navigation, che `Navigation`
    // costruisce più sotto a partire da `colors.accent`.
    // Grigio medio scelto apposta per l'inattivo: ha contrasto sufficiente sia
    // sul fondo chiaro sia su quello scuro della tab bar.
    tabBarInactiveTintColor: theme.colors.gray400,
    tabBarLabel: ({ color, children }) => (
      <TabLabel color={color}>{children}</TabLabel>
    ),
    tabBarItemStyle: {
      paddingVertical: 3,
    },
    // Colori di sfondo e bordo li applica TabBar: qui restano solo i valori
    // che non dipendono dal tema.
    tabBarStyle: {
      borderTopWidth: 1,
    },
  } satisfies BottomTabNavigationOptions,
  screens: {
    TodayTab: {
      screen: TodayScreen,
      linking: { path: "oggi" },
      options: {
        title: i18n.t("tabs.today"),
        tabBarIcon: ({ color, focused }) => (
          <CalendarDays color={color} size={24} strokeWidth={focused ? 2.5 : 2} />
        ),
      },
    },
    ProgressTab: {
      screen: ProgressScreen,
      linking: { path: "progressi" },
      options: {
        title: i18n.t("tabs.progress"),
        tabBarIcon: ({ color, focused }) => (
          <TrendingUp color={color} size={24} strokeWidth={focused ? 2.5 : 2} />
        ),
      },
    },
    GymTab: {
      screen: GymScreen,
      linking: { path: "palestra" },
      options: {
        title: i18n.t("tabs.gym"),
        tabBarIcon: ({ color, focused }) => (
          <Dumbbell color={color} size={24} strokeWidth={focused ? 2.5 : 2} />
        ),
      },
    },
    ProfileTab: {
      screen: ProfileScreen,
      linking: { path: "profilo" },
      options: {
        title: i18n.t("tabs.profile"),
        tabBarIcon: ({ color, focused }) => (
          <User color={color} size={24} strokeWidth={focused ? 2.5 : 2} />
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
    Foods: {
      screen: FoodsScreen,
      linking: { path: "alimenti" },
    },
    FoodForm: {
      screen: FoodFormScreen,
      linking: { path: "alimenti/modifica" },
    },
    FoodScan: {
      screen: FoodScanScreen,
      linking: { path: "alimenti/scansiona" },
    },
    Recipes: {
      screen: RecipesScreen,
      linking: { path: "pasti" },
    },
    RecipeForm: {
      screen: RecipeFormScreen,
      linking: { path: "pasti/modifica" },
    },
    Settings: {
      screen: SettingsScreen,
      linking: { path: "impostazioni" },
    },
    Targets: {
      screen: TargetsScreen,
      linking: { path: "obiettivi" },
    },
    Backup: {
      screen: BackupScreen,
      linking: { path: "backup" },
    },
    Diagnostics: {
      screen: DiagnosticsScreen,
      linking: { path: "diagnostica" },
    },
    MealTypes: {
      screen: MealTypesScreen,
      linking: { path: "tipi-pasto" },
    },
    Appearance: {
      screen: AppearanceScreen,
      linking: { path: "aspetto" },
    },
    Language: {
      screen: LanguageScreen,
      linking: { path: "lingua" },
    },
    Health: {
      screen: HealthScreen,
      linking: { path: "salute" },
    },
    Admin: {
      screen: AdminScreen,
      linking: { path: "admin" },
    },
    Exercises: {
      screen: ExercisesScreen,
      linking: { path: "esercizi" },
    },
    Equipment: {
      screen: EquipmentScreen,
      linking: { path: "attrezzatura" },
    },
    ExerciseDetail: {
      screen: ExerciseDetailScreen,
      linking: { path: "esercizi/dettaglio" },
    },
    Routines: {
      screen: RoutinesScreen,
      linking: { path: "schede" },
    },
    RoutineForm: {
      screen: RoutineFormScreen,
      linking: { path: "schede/modifica" },
    },
    GenerateRoutine: {
      screen: GenerateRoutineScreen,
      linking: { path: "schede/genera" },
    },
    Session: {
      screen: SessionScreen,
      linking: { path: "allenamento" },
    },
    Achievements: {
      screen: AchievementsScreen,
      linking: { path: "traguardi" },
    },
    Measurements: {
      screen: MeasurementsScreen,
      linking: { path: "misure" },
    },
    WeightHistory: {
      screen: WeightHistoryScreen,
      linking: { path: "peso/storico" },
    },
    StepsHistory: {
      screen: StepsHistoryScreen,
      linking: { path: "passi/storico" },
    },
    ProgressPhotos: {
      screen: ProgressPhotosScreen,
      linking: { path: "foto" },
    },
    MealPlan: {
      screen: MealPlanScreen,
      linking: { path: "piano" },
    },
    ShoppingList: {
      screen: ShoppingListScreen,
      linking: { path: "spesa" },
    },
    Friends: {
      screen: FriendsScreen,
      linking: { path: "amici" },
    },
    FriendProfile: {
      screen: FriendProfileScreen,
      linking: { path: "amici/profilo" },
    },
    Comparison: {
      screen: ComparisonScreen,
      linking: { path: "amici/confronto" },
    },
    MyProfile: {
      screen: MyProfileScreen,
      linking: { path: "account" },
    },
    Reminders: {
      screen: RemindersScreen,
      linking: { path: "promemoria" },
    },
    Onboarding: {
      screen: OnboardingStack,
      linking: { path: "onboarding" },
    },
  },
});

const styles = StyleSheet.create({
  tabLabel: {
    fontWeight: "500",
    fontSize: 11,
    marginTop: 2,
    overflow: "visible",
  },
});

// ─── Export ───────────────────────────────────────────────────────────────────

const StaticNavigation = createStaticNavigation(RootStack);

/**
 * Navigazione col tema di React Navigation derivato dal nostro.
 *
 * Serve perché la tab bar prende il proprio sfondo da `colors.card` del tema di
 * React Navigation: passarle uno `style` non basta, `tabBarStyle` lo sovrascrive
 * e in tema scuro la barra resterebbe bianca.
 */
export function Navigation() {
  const { colors, isDark } = useAppTheme();
  const { completed, resumeStep } = useOnboardingStore();

  /*
   * L'onboarding e' un'entrata alternativa a "Tabs", non una schermata come
   * le altre: va decisa PRIMA del primo render, non raggiunta navigando.
   * `initialState` e' letto una sola volta al montaggio di
   * `NavigationContainer` - App.tsx aspetta `useOnboardingStore().hydrate()`
   * prima di montare `<Navigation />`, quindi qui il valore e' gia' quello
   * giusto.
   *
   * Riparte dal passo salvato ricostruendo TUTTA la cronologia fino a li',
   * cosi' "Indietro" dentro il wizard funziona anche subito dopo la ripresa.
   */
  const initialState = useMemo(() => {
    if (completed) return undefined;
    const resumeIndex = ONBOARDING_STEPS.indexOf(resumeStep);
    return {
      index: 0,
      routes: [
        {
          name: "Onboarding",
          state: {
            index: resumeIndex,
            routes: ONBOARDING_STEPS.slice(0, resumeIndex + 1).map((name) => ({ name })),
          },
        },
      ],
    };
    // Solo al montaggio: cambiare `completed`/`resumeStep` a runtime non deve
    // ricostruire lo stato di navigazione sotto ai piedi di chi sta navigando.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const navigationTheme = useMemo(
    () => ({
      ...(isDark ? DarkTheme : DefaultTheme),
      dark: isDark,
      colors: {
        ...(isDark ? DarkTheme : DefaultTheme).colors,
        primary: colors.accent,
        background: colors.background,
        card: colors.surface,
        text: colors.text,
        border: colors.border,
        notification: theme.colors.error,
      },
    }),
    [colors, isDark],
  );

  // Il ref serve a chi vive FUORI dall'albero di navigazione: l'assistente e'
  // montato sopra <Navigation /> e il suo tool "navigate" non ha altro modo
  // per aprire una schermata.
  return (
    <StaticNavigation
      ref={navigationRef}
      theme={navigationTheme}
      initialState={initialState}
    />
  );
}

export type RootStackParamList = StaticParamList<typeof RootStack>;

declare global {
  namespace ReactNavigation {
    // Augmentation di React Navigation: i parametri delle singole rotte si
    // dichiarano qui.
    interface RootParamList extends RootStackParamList {
      FoodForm: { id?: string; barcode?: string };
      RecipeForm: { id?: string };
      ExerciseDetail: { id: string };
      RoutineForm: { id?: string; generatedRoutine?: RoutineInput };
      Session: { routineId: string; dayIndex: number };
    }
  }
}
