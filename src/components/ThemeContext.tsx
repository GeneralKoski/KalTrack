import { darkTheme, lightTheme, type AppTheme } from "@/src/styles";
import React, { createContext, useContext, useMemo } from "react";
import { Platform, useColorScheme } from "react-native";

const ThemeContext = createContext<AppTheme>(lightTheme);

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const systemScheme = useColorScheme();

  // Su native il tema è forzato da userInterfaceStyle in app.json.
  // Su web useColorScheme() legge la preferenza del browser — forziamo light.
  const scheme = Platform.OS === "web" ? "light" : systemScheme;

  const theme = useMemo(
    () => (scheme === "dark" ? darkTheme : lightTheme),
    [scheme],
  );

  return (
    <ThemeContext.Provider value={theme}>
      {children}
    </ThemeContext.Provider>
  );
};

/**
 * Restituisce il tema corrente (light/dark) in base alle impostazioni di sistema.
 *
 * Usare per i soli valori dinamici (colori).
 * Per padding, radius, font — importare `theme` direttamente da `@/src/styles`
 * e usare StyleSheet.create() per evitare ricalcoli ad ogni render.
 *
 * @example
 * const { colors } = useAppTheme();
 * <View style={[styles.card, { backgroundColor: colors.surface }]} />
 */
export const useAppTheme = (): AppTheme => useContext(ThemeContext);
