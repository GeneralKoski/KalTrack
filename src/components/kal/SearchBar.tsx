import { useAppTheme } from "@/src/components/ThemeContext";
import { DraftTextInput } from "@/src/components/ui";
import { useTranslation } from "@/src/hooks/useTranslation";
import { theme } from "@/src/styles";
import { Search } from "lucide-react-native";
import React from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

interface SearchBarProps {
  /**
   * Il termine come lo conosce il chiamante: qui e' il valore di partenza e
   * quello a cui il campo si riallinea quando cambia da fuori (i fogli che si
   * svuotano alla chiusura), non il testo che si sta digitando - quello vive
   * dentro `DraftTextInput`.
   */
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
      {/*
        `DraftTextInput` e non `TextInput`: questo componente non ha stato
        proprio, quindi ogni tasto passa dallo stato del chiamante - e il
        chiamante e' sempre una schermata con una lista sotto (duecento
        esercizi, l'elenco alimenti a due sezioni). E' esattamente il giro che
        `CLAUDE.md` § Quel che si digita descrive.
      */}
      <DraftTextInput
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
    paddingVertical: theme.spacing.md,
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
