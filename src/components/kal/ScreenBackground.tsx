import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { StyleSheet } from "react-native";

// Sfondo delle schermate: più chiaro al centro, leggermente verde ai bordi
// (tinta del brand). Va inserito come PRIMO figlio del contenitore radice
// della schermata: è un absolute-fill, non un wrapper con figli.
export const ScreenBackground: React.FC = () => (
  <LinearGradient
    colors={["#dcefe5", "#f0f8f4", "#f6fbf9", "#f0f8f4", "#dcefe5"]}
    locations={[0, 0.32, 0.5, 0.68, 1]}
    start={{ x: 0, y: 0 }}
    end={{ x: 0, y: 1 }}
    style={StyleSheet.absoluteFill}
    pointerEvents="none"
  />
);
