import { useThemeStore } from "@/src/stores/themeStore";
import { darkTheme, lightTheme, type AppTheme } from "@/src/styles";
import React, { createContext, useContext, useMemo } from "react";
import { useColorScheme } from "react-native";

interface ThemeContextValue extends AppTheme {
  isDark: boolean;
}

const ThemeContext = createContext<ThemeContextValue>({
  ...lightTheme,
  isDark: false,
});

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const systemScheme = useColorScheme();
  const mode = useThemeStore((s) => s.mode);

  // `system` segue il telefono, le altre due scelte vincono su di esso.
  const isDark =
    mode === "system" ? systemScheme === "dark" : mode === "dark";

  const value = useMemo(
    () => ({ ...(isDark ? darkTheme : lightTheme), isDark }),
    [isDark],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
};

/**
 * Tema corrente. Usare per i soli valori dinamici (colori semantici).
 * Per padding, radius, font e colori di brand importare `theme` da
 * `@/src/styles` e usarlo dentro StyleSheet.create().
 *
 * @example
 * const { colors } = useAppTheme();
 * <View style={[styles.card, { backgroundColor: colors.surface }]} />
 */
export const useAppTheme = (): ThemeContextValue => useContext(ThemeContext);
