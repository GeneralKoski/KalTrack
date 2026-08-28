import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
} from "react";
import { Keyboard, Platform, ScrollView, View } from "react-native";

interface FormScrollContextType {
  registerFieldRef: (name: string, ref: React.RefObject<View | null>) => void;
  unregisterFieldRef: (name: string) => void;
  scrollToFirstError: (errorFieldNames: string[]) => void;
  scrollToField: (fieldName: string) => void;
  setFocusedField: (name: string | null) => void;
}

const FormScrollContext = createContext<FormScrollContextType | null>(null);

export const useFormScrollContext = () => useContext(FormScrollContext);

/**
 * Hook per registrare un campo form nel sistema di scroll-to-error.
 * Restituisce un ref da applicare al container View del campo.
 */
export const useFieldRegistration = (name: string) => {
  const formScroll = useFormScrollContext();
  const ref = useRef<View>(null);

  useEffect(() => {
    if (formScroll) {
      formScroll.registerFieldRef(name, ref);
    }
    return () => {
      formScroll?.unregisterFieldRef(name);
    };
  }, [name, formScroll]);

  return ref;
};

interface FormScrollProviderProps {
  children: React.ReactNode;
  scrollViewRef: React.RefObject<ScrollView | null>;
  /** Ref a un View nativo dentro lo ScrollView, usato come riferimento per measureLayout */
  contentRef: React.RefObject<View | null>;
}

export const FormScrollProvider = ({
  children,
  scrollViewRef,
  contentRef,
}: FormScrollProviderProps) => {
  const fieldRefs = useRef<Map<string, React.RefObject<View | null>>>(
    new Map(),
  );

  const registerFieldRef = useCallback(
    (name: string, ref: React.RefObject<View | null>) => {
      fieldRefs.current.set(name, ref);
    },
    [],
  );

  const unregisterFieldRef = useCallback((name: string) => {
    fieldRefs.current.delete(name);
  }, []);

  const scrollToFirstError = useCallback(
    (errorFieldNames: string[]) => {
      const scrollView = scrollViewRef.current;
      const content = contentRef.current;
      if (!scrollView || !content || errorFieldNames.length === 0) return;

      // Delay per assicurarsi che il layout sia aggiornato dopo setError
      setTimeout(() => {
        // Misura la posizione di tutti i campi con errore rispetto al contentRef (View nativo)
        const measurements: Promise<{ name: string; y: number }>[] = [];

        for (const name of errorFieldNames) {
          const ref = fieldRefs.current.get(name);
          if (ref?.current) {
            measurements.push(
              new Promise((resolve, reject) => {
                ref.current!.measureLayout(
                  content,
                  (_left: number, top: number) => resolve({ name, y: top }),
                  () => reject(),
                );
              }),
            );
          }
        }

        if (measurements.length === 0) return;

        // Scrolla al campo più in alto tra quelli con errore
        Promise.allSettled(measurements).then((results) => {
          const positions = results
            .filter(
              (r): r is PromiseFulfilledResult<{ name: string; y: number }> =>
                r.status === "fulfilled",
            )
            .map((r) => r.value);

          if (positions.length === 0) {
            scrollView.scrollTo({ y: 0, animated: true });
            return;
          }

          positions.sort((a, b) => a.y - b.y);
          scrollView.scrollTo({
            y: Math.max(0, positions[0].y - 20),
            animated: true,
          });
        });
      }, 100);
    },
    [scrollViewRef, contentRef],
  );

  // Scrolla al campo specificato
  const scrollToField = useCallback(
    (fieldName: string) => {
      const scrollView = scrollViewRef.current;
      const content = contentRef.current;
      if (!scrollView || !content) return;

      const ref = fieldRefs.current.get(fieldName);
      if (!ref?.current) return;

      ref.current.measureLayout(
        content,
        (_left: number, top: number) => {
          scrollView.scrollTo({
            y: Math.max(0, top - 20),
            animated: true,
          });
        },
        () => {},
      );
    },
    [scrollViewRef, contentRef],
  );

  // Traccia il campo attualmente in focus
  const focusedFieldRef = useRef<string | null>(null);
  const keyboardOpenRef = useRef(false);

  const setFocusedField = useCallback(
    (name: string | null) => {
      focusedFieldRef.current = name;
      // Se la tastiera è già aperta e cambio campo, scrolla subito al nuovo campo
      if (name && keyboardOpenRef.current) {
        setTimeout(() => scrollToField(name), 50);
      }
    },
    [scrollToField],
  );

  // Ascolta eventi tastiera per scrollare al campo in focus
  useEffect(() => {
    if (Platform.OS === "web") return;

    const showListener = Keyboard.addListener("keyboardDidShow", () => {
      keyboardOpenRef.current = true;
      if (focusedFieldRef.current) {
        // Delay per assicurarsi che il padding della tastiera sia applicato
        setTimeout(() => {
          if (focusedFieldRef.current) {
            scrollToField(focusedFieldRef.current);
          }
        }, 100);
      }
    });

    const hideListener = Keyboard.addListener("keyboardDidHide", () => {
      keyboardOpenRef.current = false;
    });

    return () => {
      showListener.remove();
      hideListener.remove();
    };
  }, [scrollToField]);

  return (
    <FormScrollContext.Provider
      value={{
        registerFieldRef,
        unregisterFieldRef,
        scrollToFirstError,
        scrollToField,
        setFocusedField,
      }}
    >
      {children}
    </FormScrollContext.Provider>
  );
};
