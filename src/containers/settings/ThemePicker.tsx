import { ListGroup, ListRow } from "@/src/components/kal";
import { useAppTheme } from "@/src/components/ThemeContext";
import { useTranslation } from "@/src/hooks/useTranslation";
import { THEME_MODES, useThemeStore, type ThemeMode } from "@/src/stores/themeStore";
import { Check, Moon, Smartphone, Sun } from "lucide-react-native";
import React from "react";

const ICONS: Record<ThemeMode, typeof Sun> = {
  system: Smartphone,
  light: Sun,
  dark: Moon,
};

/**
 * Il blocco lo disegna `ListGroup`, non piu' questo file.
 *
 * Fino al 7 settembre 2026 qui c'erano a mano il riquadro, il raggio e il
 * separatore fra le righe - e le stesse trenta righe stavano copiate in
 * `LanguagePicker`. Erano la prova che il blocco serviva: adesso e' un
 * componente, e queste due schermate lo usano invece di riscriverlo.
 */
export const ThemePicker: React.FC = () => {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const mode = useThemeStore((s) => s.mode);
  const setMode = useThemeStore((s) => s.setMode);

  return (
    <ListGroup>
      {THEME_MODES.map((option) => {
        const Icon = ICONS[option];
        const selected = option === mode;

        return (
          <ListRow
            key={option}
            label={t(`settings.theme_${option}`)}
            icon={
              <Icon size={20} color={selected ? colors.accent : colors.textMuted} />
            }
            labelColor={selected ? colors.accent : undefined}
            onPress={() => setMode(option)}
            right={selected ? <Check size={18} color={colors.accent} /> : null}
          />
        );
      })}
    </ListGroup>
  );
};
