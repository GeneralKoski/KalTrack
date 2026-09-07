import React from "react";
import {
  KeyboardAvoidingView,
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
      // `padding` ANCHE su Android, e non `undefined`.
      //
      // Il manifest ha `windowSoftInputMode="adjustResize"`, ma da Expo 55
      // l'edge-to-edge e' obbligatorio (`edgeToEdgeEnabled=true`,
      // targetSdk 36): con la decor view che non ritaglia gli inset di
      // sistema, Android non restringe piu' la finestra alla comparsa della
      // tastiera - la dichiara solo come inset. Quindi `adjustResize` qui non
      // fa niente, e con `behavior` assente `KeyboardAvoidingView` rende un
      // `View` nudo: nessun riparo, la tastiera copriva i campi in fondo.
      //
      // `padding` non rischia la doppia compressione temuta prima: l'offset e'
      // `frame.y + frame.height - keyboardY`, quindi se un giorno la finestra
      // tornasse a restringersi il fondo del riquadro sarebbe gia' sopra la
      // tastiera e l'offset verrebbe zero da solo.
      behavior="padding"
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
