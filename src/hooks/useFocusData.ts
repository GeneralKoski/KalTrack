import { logger } from "@/src/utils/logger";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useRef, useState } from "react";

interface FocusData<T> {
  data: T | null;
  loading: boolean;
  reload: () => void;
}

/**
 * Carica dati dal DB locale al focus della schermata (local-first: nessun
 * fetch di rete). Il loader è tenuto in un ref, così l'effetto di focus resta
 * stabile anche se il chiamante lo ridefinisce a ogni render.
 */
export function useFocusData<T>(loader: () => Promise<T>): FocusData<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;
  const dataRef = useRef<T | null>(null);

  const run = useCallback(() => {
    let active = true;
    // Spinner solo al primo caricamento: se ho gia' dati (re-focus), li tengo a
    // schermo e ricarico in sottofondo, cosi' non lampeggia il loader ogni volta.
    if (dataRef.current === null) setLoading(true);
    (async () => {
      try {
        const result = await loaderRef.current();
        if (active) {
          dataRef.current = result;
          setData(result);
        }
      } catch (error) {
        logger.error("[useFocusData] errore caricamento", error);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useFocusEffect(run);

  return { data, loading, reload: run };
}
