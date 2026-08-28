// ─── Palette (stessi valori in entrambi i temi) ───────────────────────────────
// Usare questi colori in StyleSheet.create() — non cambiano mai.

const palette = {
  primary: "#6366f1",
  primaryDark: "#4f46e5",
  secondary: "#f59e0b",

  success: "#22c55e",
  error: "#ef4444",
  warning: "#f97316",
  info: "#3b82f6",

  white: "#ffffff",
  black: "#000000",

  gray50: "#f9fafb",
  gray100: "#f3f4f6",
  gray200: "#e5e7eb",
  gray300: "#d1d5db",
  gray400: "#9ca3af",
  gray500: "#6b7280",
  gray600: "#4b5563",
  gray700: "#374151",
  gray800: "#1f2937",
  gray900: "#111827",
};

// ─── Colori semantici (cambiano tra light/dark) ───────────────────────────────
// NON usare in StyleSheet.create() — usare solo tramite useAppTheme().

const lightSemanticColors = {
  background: "#f5f6fa",
  surface: "#ffffff",
  border: "#e5e7eb",
  text: palette.gray900,
  textMuted: palette.gray500,
};

const darkSemanticColors = {
  background: "#0f0f0f",
  surface: "#1c1c1e",
  border: "#2c2c2e",
  text: "#f2f2f7",
  textMuted: palette.gray400,
};

// ─── Valori condivisi (non dipendono dal tema) ────────────────────────────────

// ─── Font ────────────────────────────────────────────────────────────────────
// I nomi corrispondono alle chiavi usate in useFonts() (App.tsx).
// expo-font li registra con questo nome su iOS, Android e web (@font-face).

export type FontWeight = "light" | "regular" | "medium" | "semibold" | "bold";

const fontFamilies: Record<FontWeight, string> = {
  light: "Poppins-Light",
  regular: "Poppins-Regular",
  medium: "Poppins-Medium",
  semibold: "Poppins-SemiBold",
  bold: "Poppins-Bold",
};

const italicFontFamilies: Record<FontWeight, string> = {
  light: "Poppins-LightItalic",
  regular: "Poppins-Italic",
  medium: "Poppins-MediumItalic",
  semibold: "Poppins-SemiBoldItalic",
  bold: "Poppins-BoldItalic",
};

// Mappa fontWeight RN (numerico/stringa) → FontWeight custom
const fontWeightMap: Record<string, FontWeight> = {
  "300": "light",
  "400": "regular",
  "500": "medium",
  "600": "semibold",
  "700": "bold",
  normal: "regular",
  bold: "bold",
};

/** Risolve la fontFamily corretta dato peso e stile. */
export function resolveFontFamily(
  weight: FontWeight = "regular",
  italic = false,
): string {
  return italic ? italicFontFamilies[weight] : fontFamilies[weight];
}

/** Mappa un fontWeight RN a un FontWeight custom. */
export function resolveFontWeight(
  rn: string | number | undefined,
): FontWeight | undefined {
  if (rn == null) return undefined;
  return fontWeightMap[String(rn)];
}

// Alias piatto per accesso diretto (es. theme.fonts.bold, theme.fonts.boldItalic)
const fonts = {
  ...fontFamilies,
  lightItalic: italicFontFamilies.light,
  regularItalic: italicFontFamilies.regular,
  mediumItalic: italicFontFamilies.medium,
  semiboldItalic: italicFontFamilies.semibold,
  boldItalic: italicFontFamilies.bold,
};

const radius = {
  xs: 4,
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  full: 9999,
};

const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

// ─── Export ───────────────────────────────────────────────────────────────────

/**
 * Valori statici — sicuri per StyleSheet.create().
 * `theme.colors` contiene solo la palette (uguale in light e dark).
 * Per i colori semantici (background, surface, border, text) usare useAppTheme().
 */
export const MAX_WEB_WIDTH = 480;

export const theme = {
  colors: palette,
  fonts,
  radius,
  spacing,
};

export const lightTheme = {
  colors: { ...palette, ...lightSemanticColors },
};

export const darkTheme = {
  colors: { ...palette, ...darkSemanticColors },
};

export type AppTheme = typeof lightTheme;
