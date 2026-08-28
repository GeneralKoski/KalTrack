import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import { useTranslation } from "@/src/hooks/useTranslation";
import { theme } from "@/src/styles";
import * as ImagePicker from "expo-image-picker";
import { Camera, ImagePlus, X } from "lucide-react-native";
import React from "react";
import { Image, StyleSheet, TouchableOpacity, View } from "react-native";

interface PhotoFieldProps {
  uri: string | null;
  onChange: (uri: string | null) => void;
  /** Altezza dell'anteprima. Più bassa dove la foto è un dettaglio. */
  height?: number;
}

/**
 * Selettore foto con anteprima, usato da alimenti e pasti. Offre sia galleria
 * sia fotocamera: un prodotto lo si fotografa sul momento, un piatto quasi
 * sempre lo si ha già in galleria.
 */
export const PhotoField: React.FC<PhotoFieldProps> = ({
  uri,
  onChange,
  height = 160,
}) => {
  const { t } = useTranslation();
  const { colors } = useAppTheme();

  const pickFromLibrary = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.7,
      allowsEditing: true,
      aspect: [4, 3],
    });
    if (!result.canceled && result.assets[0]) onChange(result.assets[0].uri);
  };

  const takePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return;

    const result = await ImagePicker.launchCameraAsync({
      quality: 0.7,
      allowsEditing: true,
      aspect: [4, 3],
    });
    if (!result.canceled && result.assets[0]) onChange(result.assets[0].uri);
  };

  if (uri) {
    return (
      <View>
        <Image source={{ uri }} style={[styles.image, { height }]} />
        <TouchableOpacity
          style={styles.remove}
          onPress={() => onChange(null)}
          activeOpacity={0.6}
          hitSlop={8}
        >
          <X size={16} color={theme.colors.white} />
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.actions}>
      <TouchableOpacity
        style={[styles.action, { borderColor: colors.border }]}
        onPress={pickFromLibrary}
        activeOpacity={0.6}
      >
        <ImagePlus size={20} color={colors.textMuted} />
        <Text style={[styles.actionLabel, { color: colors.textMuted }]}>
          {t("photo.from_gallery")}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.action, { borderColor: colors.border }]}
        onPress={takePhoto}
        activeOpacity={0.6}
      >
        <Camera size={20} color={colors.textMuted} />
        <Text style={[styles.actionLabel, { color: colors.textMuted }]}>
          {t("photo.take")}
        </Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  image: {
    width: "100%",
    borderRadius: theme.radius.xl,
  },
  remove: {
    position: "absolute",
    top: theme.spacing.sm,
    right: theme.spacing.sm,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: theme.radius.full,
    padding: 6,
  },
  actions: {
    flexDirection: "row",
    gap: theme.spacing.sm,
  },
  action: {
    flex: 1,
    height: 88,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing.xs,
  },
  actionLabel: {
    fontSize: 13,
  },
});
