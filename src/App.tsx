import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import React, { useEffect, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import Toast from "react-native-toast-message";

import { GluestackUIProvider } from "@/components/ui/gluestack-ui-provider";
import "@/global.css";
import { ThemeProvider, useAppTheme } from "@/src/components/ThemeContext";
import { toastConfig } from "@/src/components/toastConfig";
import { initDatabase } from "@/src/db";
import { AssistantButton } from "@/src/containers/assistant/AssistantButton";
import { Navigation } from "@/src/navigation";
import { useThemeStore } from "@/src/stores/themeStore";
import { logger } from "@/src/utils/logger";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";

// Dentro ThemeProvider: le icone della status bar devono invertirsi col tema.
function ThemedStatusBar() {
  const { isDark } = useAppTheme();
  return <StatusBar style={isDark ? "light" : "dark"} />;
}

export function App() {
  const [dbReady, setDbReady] = useState(false);
  // Senza questo gate l'app mostrerebbe un lampo di tema chiaro prima che la
  // preferenza salvata venga riletta da AsyncStorage.
  const themeReady = useThemeStore((s) => s.isHydrated);

  // Su native i font sono embedded dal plugin expo-font (app.json).
  const [fontsLoaded] = useFonts({
    "Poppins-Light": require("@/assets/fonts/Poppins-Light.ttf"),
    "Poppins-LightItalic": require("@/assets/fonts/Poppins-LightItalic.ttf"),
    "Poppins-Regular": require("@/assets/fonts/Poppins-Regular.ttf"),
    "Poppins-Italic": require("@/assets/fonts/Poppins-Italic.ttf"),
    "Poppins-Medium": require("@/assets/fonts/Poppins-Medium.ttf"),
    "Poppins-MediumItalic": require("@/assets/fonts/Poppins-MediumItalic.ttf"),
    "Poppins-SemiBold": require("@/assets/fonts/Poppins-SemiBold.ttf"),
    "Poppins-SemiBoldItalic": require("@/assets/fonts/Poppins-SemiBoldItalic.ttf"),
    "Poppins-Bold": require("@/assets/fonts/Poppins-Bold.ttf"),
    "Poppins-BoldItalic": require("@/assets/fonts/Poppins-BoldItalic.ttf"),
  });

  // Gate d'avvio: font caricati + schema del database migrato.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        await initDatabase();
      } catch (error) {
        // Sbloccare comunque l'avvio: senza questo l'app resterebbe sulla
        // splash per sempre e non ci sarebbe modo di vedere l'errore.
        logger.error("[app] inizializzazione database fallita", error);
      } finally {
        if (active) setDbReady(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (fontsLoaded && dbReady && themeReady) SplashScreen.hideAsync();
  }, [fontsLoaded, dbReady, themeReady]);

  if (!fontsLoaded || !dbReady || !themeReady) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <GluestackUIProvider>
        <SafeAreaProvider>
          <ThemeProvider>
            <ThemedStatusBar />
            <BottomSheetModalProvider>
              <Navigation />
              {/* Sopra la navigazione: l'assistente è uno strato dell'app,
                  raggiungibile ovunque senza che ogni schermata lo monti. */}
              <AssistantButton />
              <Toast config={toastConfig} />
            </BottomSheetModalProvider>
          </ThemeProvider>
        </SafeAreaProvider>
      </GluestackUIProvider>
    </GestureHandlerRootView>
  );
}
