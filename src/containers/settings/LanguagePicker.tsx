import { ListGroup, ListRow } from "@/src/components/kal";
import { useAppTheme } from "@/src/components/ThemeContext";
import { useTranslation } from "@/src/hooks/useTranslation";
import {
  SUPPORTED_LANGUAGES,
  useTranslationStore,
} from "@/src/stores/translationStore";
import { Check } from "lucide-react-native";
import React from "react";

/** Il blocco lo disegna `ListGroup`: vedi la nota in `ThemePicker`. */
export const LanguagePicker: React.FC = () => {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const language = useTranslationStore((s) => s.language);
  const setLanguage = useTranslationStore((s) => s.setLanguage);

  return (
    // Nessuna icona in queste righe: il separatore parte dal bordo, o
    // comincerebbe in mezzo alla parola.
    <ListGroup indent={0}>
      {SUPPORTED_LANGUAGES.map((option) => {
        const selected = option === language;

        return (
          <ListRow
            key={option}
            label={t(`settings.language_${option}`)}
            labelColor={selected ? colors.accent : undefined}
            onPress={() => setLanguage(option)}
            right={selected ? <Check size={18} color={colors.accent} /> : null}
          />
        );
      })}
    </ListGroup>
  );
};
