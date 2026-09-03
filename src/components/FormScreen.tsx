import React from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  View,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";

interface FormScreenProps extends Omit<
  ScrollViewProps,
  "contentContainerStyle"
> {
  children: React.ReactNode;
  /**
   * IMPORTANTE: usare `flexGrow: 1` e NON `flex: 1`
   * per permettere lo scroll corretto con KeyboardAvoidingView.
   */
  contentContainerStyle?: StyleProp<ViewStyle>;
  /** Spazio extra in fondo per non incollare il contenuto alla tastiera. */
  bottomSpacing?: number;
}

/**
 * Wrapper per screen con form.
 * Gestisce automaticamente KeyboardAvoidingView + ScrollView su tutte le piattaforme.
 *
 * @example
 * <SafeAreaView style={{ flex: 1 }}>
 *   <FormScreen contentContainerStyle={{ flexGrow: 1, padding: 16 }}>
 *     <DfForm url="/login">...</DfForm>
 *   </FormScreen>
 * </SafeAreaView>
 */
export const FormScreen = ({
  children,
  contentContainerStyle,
  bottomSpacing = 0,
  ...scrollViewProps
}: FormScreenProps) => {
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      // Su Android il manifest ha gia' `windowSoftInputMode="adjustResize"`
      // (vedi AndroidManifest.xml): la finestra si restringe gia' da sola
      // quando appare la tastiera. `behavior="height"` qui sopra lo rifarebbe
      // una seconda volta, comprimendo il contenuto due volte e spingendo il
      // footer (es. il pulsante "Avanti" dell'onboarding) sotto lo schermo.
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={contentContainerStyle}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        {...scrollViewProps}
      >
        {children}
        {bottomSpacing > 0 && <View style={{ height: bottomSpacing }} />}
      </ScrollView>
    </KeyboardAvoidingView>
  );
};
