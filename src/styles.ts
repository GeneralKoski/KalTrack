// ─── Palette (stessi valori in entrambi i temi) ───────────────────────────────
// Usare questi colori in StyleSheet.create() — non cambiano mai.

// L'interfaccia è monocroma: nero, bianco e grigi metallizzati. Il colore è
// riservato ai DATI (macronutrienti, stato rispetto all'obiettivo, errori), così
// quando compare significa sempre qualcosa. Per questo qui non esistono
// `primary` né una scala di brand: il colore dell'interattivo dipende dal tema
// (scuro su chiaro, chiaro su scuro) e vive nei token semantici come `accent`.
const palette = {
  // Marcatore di preferito: è uno stato dell'utente, non decorazione.
  secondary: "#f59e0b",

  // Colori dei macronutrienti: sempre gli stessi in grafici, barre e legende,
  // così le tre rappresentazioni non possono divergere.
  macroProtein: "#3b82f6",
  macroCarbs: "#f59e0b",
  macroFat: "#a855f7",

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
  background: "#f2f2f4",
  surface: "#ffffff",
  // Riempimenti tenui: sfondo di chip, tab inattivi, segnaposto immagine.
  surfaceMuted: "#e8e8ea",
  border: "#d8d8dc",
  text: "#0a0a0b",
  textSecondary: "#3f3f46",
  textMuted: "#71717a",
  textFaint: "#a1a1aa",

  // Interattivo: scuro sul chiaro, chiaro sullo scuro. Sostituisce il vecchio
  // `primary` di brand, che non esiste più.
  accent: "#18181b",
  // Testo e icone SOPRA una superficie `accent`.
  accentOn: "#ffffff",

  // Superficie metallizzata: gradiente dall'alto verso il basso più una linea
  // di luce sul bordo superiore. Sul chiaro è argento.
  metalTop: "#fdfdfd",
  metalBottom: "#e7e7ea",
  metalHighlight: "#ffffff",
  metalEdge: "#cfcfd4",

  // Estremi del gradiente di sfondo delle schermate.
  gradientEdge: "#e6e6e9",
  gradientCenter: "#f7f7f9",
};

const darkSemanticColors = {
  // Nero pieno, non grigio scurissimo: su OLED spegne davvero i pixel.
  background: "#000000",
  surface: "#131316",
  surfaceMuted: "#1e1e22",
  border: "#2a2a2f",
  text: "#fafafa",
  textSecondary: "#d4d4d8",
  textMuted: "#a1a1aa",
  textFaint: "#71717a",

  accent: "#e5e5e7",
  accentOn: "#0a0a0b",

  metalTop: "#3a3a3d",
  metalBottom: "#232326",
  metalHighlight: "#4a4a4d",
  metalEdge: "#101013",

  gradientEdge: "#000000",
  gradientCenter: "#0a0a0c",
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

const macro = {
  protein: palette.macroProtein,
  carbs: palette.macroCarbs,
  fat: palette.macroFat,
};

export const theme = {
  colors: { ...palette, macro },
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
