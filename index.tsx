import { registerRootComponent } from "expo";
import * as SplashScreen from "expo-splash-screen";
import { App } from "./src/App";

// Blocca la splash screen prima che React si avvii.
// Verrà nascosta esplicitamente in App.tsx una volta completata l'inizializzazione.
SplashScreen.preventAutoHideAsync();

registerRootComponent(App);
