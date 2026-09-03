import { createNativeStackNavigator } from "@react-navigation/native-stack";

import { OnboardingActivityGoalScreen } from "@/src/navigation/screens/OnboardingActivityGoalScreen";
import { OnboardingProfileBasicsScreen } from "@/src/navigation/screens/OnboardingProfileBasicsScreen";
import { OnboardingTargetsScreen } from "@/src/navigation/screens/OnboardingTargetsScreen";
import { OnboardingThemeScreen } from "@/src/navigation/screens/OnboardingThemeScreen";
import { OnboardingWeightScreen } from "@/src/navigation/screens/OnboardingWeightScreen";
import { OnboardingWelcomeScreen } from "@/src/navigation/screens/OnboardingWelcomeScreen";

/**
 * Il flusso del primo avvio, annidato dentro `RootStack` come "Onboarding"
 * (stesso schema di `Tab`, anch'esso un navigatore intero passato come
 * `screen`). I sei nomi qui devono combaciare con `ONBOARDING_STEPS` in
 * `src/domain/onboarding.ts`.
 */
export const OnboardingStack = createNativeStackNavigator({
  screenOptions: { headerShown: false },
  screens: {
    OnboardingWelcome: {
      screen: OnboardingWelcomeScreen,
      linking: { path: "benvenuto" },
    },
    OnboardingProfileBasics: {
      screen: OnboardingProfileBasicsScreen,
      linking: { path: "dati-base" },
    },
    OnboardingWeight: {
      screen: OnboardingWeightScreen,
      linking: { path: "peso" },
    },
    OnboardingActivityGoal: {
      screen: OnboardingActivityGoalScreen,
      linking: { path: "attivita-obiettivo" },
    },
    OnboardingTargets: {
      screen: OnboardingTargetsScreen,
      linking: { path: "target" },
    },
    OnboardingTheme: {
      screen: OnboardingThemeScreen,
      linking: { path: "tema" },
    },
  },
});
