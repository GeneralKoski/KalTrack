import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import { useTranslation } from "@/src/hooks/useTranslation";
import { THEME_MODES, useThemeStore, type ThemeMode } from "@/src/stores/themeStore";
import { theme } from "@/src/styles";
import { Check, Moon, Smartphone, Sun } from "lucide-react-native";
import React from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";

const ICONS: Record<ThemeMode, typeof Sun> = {
  system: Smartphone,
  light: Sun,
  dark: Moon,
};

export const ThemePicker: React.FC = () => {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const mode = useThemeStore((s) => s.mode);
  const setMode = useThemeStore((s) => s.setMode);

  return (
    <View style={[styles.group, { backgroundColor: colors.surface }]}>
      {THEME_MODES.map((option, index) => {
        const Icon = ICONS[option];
        const selected = option === mode;

        return (
          <TouchableOpacity
            key={option}
            style={[
              styles.row,
              index > 0 && { borderTopWidth: 1, borderTopColor: colors.border },
            ]}
            onPress={() => setMode(option)}
            activeOpacity={0.6}
          >
            <Icon
              size={20}
              color={selected ? theme.colors.primary : colors.textMuted}
            />
            <Text
              style={[
                styles.label,
                { color: selected ? theme.colors.primary : colors.text },
              ]}
            >
              {t(`settings.theme_${option}`)}
            </Text>
            {selected ? (
              <Check size={18} color={theme.colors.primary} />
            ) : null}
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  group: {
    borderRadius: theme.radius.xl,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
  },
  label: {
    flex: 1,
    fontSize: 15,
    fontWeight: "500",
  },
});
