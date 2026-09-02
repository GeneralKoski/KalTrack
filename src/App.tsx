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
import { ExitConfirm } from "@/src/components/ExitConfirm";
import { Navigation } from "@/src/navigation";
import { syncStepsOnStartup } from "@/src/services/healthConnect";
import { syncSharedStats } from "@/src/services/shareSync";
import { runSync } from "@/src/services/sync";
import { startSyncScheduler } from "@/src/services/syncScheduler";
import { useAccountStore } from "@/src/stores/accountStore";
import { useAiKeyStore } from "@/src/stores/aiKeyStore";
import { configureNotificationHandler } from "@/src/services/reminders";
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

  // I promemoria devono comparire anche con l'app in primo piano: senza
  // questo handler Android li consegna in silenzio e sembrano non partiti.
  useEffect(() => {
    configureNotificationHandler();
  }, []);

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
      // Dopo il gate, non dentro: i passi di Health Connect sono un extra e
      // non devono trattenere la splash se il provider è lento a rispondere.
      // La chiave dell'assistente sta in SecureStore: senza questa riga
      // `hasAiKey()` direbbe di no fino al primo salvataggio, e i riquadri
      // dell'AI comparirebbero spenti a chi la chiave ce l'ha gia'.
      void useAiKeyStore.getState().restore();
      void syncStepsOnStartup();
      // L'account e' facoltativo: senza, `restore` non trova niente e la
      // pubblicazione dei totali non parte nemmeno.
      void useAccountStore
        .getState()
        .restore()
        .then(async () => {
          // Prima la copia del database, poi i totali per gli amici: i
          // secondi si calcolano dai primi, e invertirli pubblicherebbe i
          // numeri di ieri.
          await runSync();
          await syncSharedStats();
        });
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (fontsLoaded && dbReady && themeReady) SplashScreen.hideAsync();
  }, [fontsLoaded, dbReady, themeReady]);

  // La sincronizzazione periodica parte quando il database e' pronto e si
  // ferma con l'app: senza la pulizia, un ricaricamento in sviluppo
  // lascerebbe dietro un timer per ogni ricarica.
  useEffect(() => {
    if (!dbReady) return;
    return startSyncScheduler();
  }, [dbReady]);

  if (!fontsLoaded || !dbReady || !themeReady) return null;

  return (
    /*
     * ThemeProvider STA SOPRA GluestackUIProvider, e non è un dettaglio di
     * ordine.
     *
     * Gluestack porta le sue modali dentro l'`OverlayProvider`, cioè le
     * rimonta nel punto dell'albero in cui vive quel provider. Con il tema
     * sotto, tutto quel che dentro una modale leggeva `useAppTheme()` finiva
     * fuori dal contesto e prendeva il valore di default - il tema CHIARO. Da
     * lì l'"Annulla" grigio su nero: era l'accent del tema chiaro (#18181b)
     * disegnato sopra la superficie scura.
     *
     * Si vedeva solo sui componenti che risolvono il colore da soli
     * (`DfButton`): quelli a cui il colore arriva già calcolato dal chiamante
     * erano giusti, ed è il motivo per cui il difetto sembrava riguardare un
     * pulsante solo.
     */
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <GluestackUIProvider>
          <SafeAreaProvider>
            <ThemedStatusBar />
            <BottomSheetModalProvider>
              <Navigation />
              {/* Il tasto indietro sulla schermata iniziale chiudeva l'app di
                  colpo: da qui in poi chiede conferma. */}
              <ExitConfirm />
              <Toast config={toastConfig} />
            </BottomSheetModalProvider>
          </SafeAreaProvider>
        </GluestackUIProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
