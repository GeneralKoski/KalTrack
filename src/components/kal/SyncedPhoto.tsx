import { useAppTheme } from "@/src/components/ThemeContext";
import { useLocalPhoto } from "@/src/hooks/useLocalPhoto";
import { theme } from "@/src/styles";
import { Image, type ImageContentFit } from "expo-image";
import { ImageOff } from "lucide-react-native";
import React from "react";
import { StyleSheet, View, type ImageStyle, type StyleProp } from "react-native";

interface Props {
  uri: string | null | undefined;
  style?: StyleProp<ImageStyle>;
  contentFit?: ImageContentFit;
  /** Quanto grande fare l'icona del segnaposto. */
  placeholderSize?: number;
}

/**
 * Una foto che puo' essere stata scattata su un altro telefono.
 *
 * Se il file non e' qui lo scarica; finche' non c'e' mostra un segnaposto
 * invece di un rettangolo vuoto. La differenza conta: un rettangolo vuoto
 * sembra un difetto dell'app, un segnaposto dice che la foto esiste e non e'
 * (ancora) arrivata.
 *
 * `expo-image` e non l'Image di React Native: le foto dei progressi si
 * guardano in griglia e a schermo intero, e la cache in memoria di expo-image
 * evita di rileggere dal disco a ogni scorrimento.
 */
export const SyncedPhoto: React.FC<Props> = ({
  uri,
  style,
  contentFit,
  placeholderSize = 18,
}) => {
  const { colors } = useAppTheme();
  const locale = useLocalPhoto(uri);

  if (locale) {
    return <Image source={{ uri: locale }} style={style} contentFit={contentFit} />;
  }

  return (
    <View
      style={[
        style,
        styles.placeholder,
        { backgroundColor: colors.surfaceMuted },
      ]}
    >
      <ImageOff size={placeholderSize} color={colors.textFaint} />
    </View>
  );
};

const styles = StyleSheet.create({
  placeholder: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radius.md,
  },
});
