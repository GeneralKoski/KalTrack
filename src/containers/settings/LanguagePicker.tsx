import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import { useTranslation } from "@/src/hooks/useTranslation";
import {
  SUPPORTED_LANGUAGES,
  useTranslationStore,
} from "@/src/stores/translationStore";
import { theme } from "@/src/styles";
import { Check } from "lucide-react-native";
import React from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";

export const LanguagePicker: React.FC = () => {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const language = useTranslationStore((s) => s.language);
  const setLanguage = useTranslationStore((s) => s.setLanguage);

  return (
    <View style={[styles.group, { backgroundColor: colors.surface }]}>
      {SUPPORTED_LANGUAGES.map((option, index) => {
        const selected = option === language;

        return (
          <TouchableOpacity
            key={option}
            style={[
              styles.row,
              index > 0 && { borderTopWidth: 1, borderTopColor: colors.border },
            ]}
            onPress={() => setLanguage(option)}
            activeOpacity={0.6}
          >
            <Text
              style={[
                styles.label,
                { color: selected ? colors.accent : colors.text },
              ]}
            >
              {t(`settings.language_${option}`)}
            </Text>
            {selected ? <Check size={18} color={colors.accent} /> : null}
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
