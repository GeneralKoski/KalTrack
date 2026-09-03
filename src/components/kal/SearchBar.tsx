import { useAppTheme } from "@/src/components/ThemeContext";
import { TextInput } from "@/src/components/ui";
import { useTranslation } from "@/src/hooks/useTranslation";
import { theme } from "@/src/styles";
import { Search } from "lucide-react-native";
import React from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

interface SearchBarProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  // variante "onDark" per l'uso dentro l'header a gradiente.
  onDark?: boolean;
  // Mostra uno spinner al posto della lente mentre la ricerca si aggiorna.
  loading?: boolean;
}

export const SearchBar: React.FC<SearchBarProps> = ({
  value,
  onChangeText,
  placeholder,
  onDark = false,
  loading = false,
}) => {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const accent = onDark ? "rgba(255,255,255,0.7)" : colors.textFaint;
  return (
    <View
      style={[
        styles.container,
        onDark
          ? styles.dark
          : [
              styles.light,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ],
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={accent} style={styles.icon} />
      ) : (
        <Search size={20} color={accent} />
      )}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder ?? t("search")}
        placeholderTextColor={accent}
        style={[
          styles.input,
          { color: onDark ? theme.colors.white : colors.text },
        ]}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    borderRadius: theme.radius.full,
    paddingHorizontal: theme.spacing.md,
    height: 48,
  },
  light: { borderWidth: 1 },
  dark: { backgroundColor: "rgba(255,255,255,0.15)" },
  // Larghezza pari all'icona Search (20) per non spostare il layout quando lo
  // spinner la sostituisce.
  icon: { width: 20 },
  input: {
    flex: 1,
    fontSize: 16,
    padding: 0,
    // Centra il glifo nei 48px anche su Android; il padding del font lo toglie
    // gia' il TextInput di ui/.
    textAlignVertical: "center",
  },
});
