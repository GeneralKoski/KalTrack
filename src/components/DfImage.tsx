import { theme } from "@/src/styles";
import React, { useState } from "react";
import {
  Image,
  type ImageStyle,
  StyleSheet,
  View,
  type ViewStyle,
} from "react-native";

// Placeholder locale — sostituire con l'asset del progetto
const PLACEHOLDER = require("@/assets/images/icon.png");

interface DfImageProps {
  source?: string | number | null;
  placeholder?: number;
  style?: ImageStyle;
  containerStyle?: ViewStyle;
  resizeMode?: "cover" | "contain" | "stretch" | "center";
}

/**
 * Wrapper su Image con:
 * - Skeleton durante il caricamento
 * - Fallback automatico su errore o source mancante
 */
export const DfImage = ({
  source,
  placeholder = PLACEHOLDER,
  style,
  containerStyle,
  resizeMode = "cover",
}: DfImageProps) => {
  const [loading, setLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  const isInvalid =
    !source || (typeof source === "string" && source.trim() === "");

  const imageSource = isInvalid || hasError ? placeholder : source;

  return (
    <View style={[styles.container, containerStyle]}>
      {/* Skeleton */}
      {loading && !isInvalid && (
        <View style={[StyleSheet.absoluteFill, styles.skeleton]} />
      )}

      <Image
        source={
          typeof imageSource === "string" ? { uri: imageSource } : imageSource
        }
        style={[StyleSheet.absoluteFill, style]}
        resizeMode={resizeMode}
        onLoad={() => setLoading(false)}
        onError={() => {
          setLoading(false);
          setHasError(true);
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    overflow: "hidden",
    backgroundColor: theme.colors.gray100,
  },
  skeleton: {
    backgroundColor: theme.colors.gray200,
  },
});
