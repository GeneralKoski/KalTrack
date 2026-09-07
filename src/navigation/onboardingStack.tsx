import { createNativeStackNavigator } from "@react-navigation/native-stack";

import { OnboardingAccountScreen } from "@/src/navigation/screens/OnboardingAccountScreen";
import { OnboardingProfileScreen } from "@/src/navigation/screens/OnboardingProfileScreen";
import { OnboardingThemeScreen } from "@/src/navigation/screens/OnboardingThemeScreen";
import { OnboardingWelcomeScreen } from "@/src/navigation/screens/OnboardingWelcomeScreen";

/**
 * Il flusso del primo avvio, annidato dentro `RootStack` come "Onboarding"
 * (stesso schema di `Tab`, anch'esso un navigatore intero passato come
 * `screen`). I quattro nomi qui devono combaciare con `ONBOARDING_STEPS` in
 * `src/domain/onboarding.ts`, che spiega perché sono quattro e non sette.
 */
export const OnboardingStack = createNativeStackNavigator({
  screenOptions: { headerShown: false },
  screens: {
    OnboardingWelcome: {
      screen: OnboardingWelcomeScreen,
      linking: { path: "benvenuto" },
    },
    OnboardingProfile: {
      screen: OnboardingProfileScreen,
      linking: { path: "dati" },
    },
    OnboardingTheme: {
      screen: OnboardingThemeScreen,
      linking: { path: "tema" },
    },
    OnboardingAccount: {
      screen: OnboardingAccountScreen,
      linking: { path: "account" },
    },
  },
});
