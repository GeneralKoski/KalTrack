import { i18n } from "@/src/i18n";
import { useSyncStore } from "@/src/stores/syncStore";
import { logger } from "@/src/utils/logger";
import { showToast } from "@/src/utils/toast";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useRef, useState } from "react";

interface FocusData<T> {
  data: T | null;
  loading: boolean;
  reload: () => void;
}

/**
 * Carica dati dal DB locale al focus della schermata (local-first: nessun
 * fetch di rete) e ogni volta che il loader cambia.
 *
 * Il loader va memoizzato dal chiamante con useCallback sulle sue dipendenze
 * (il termine di ricerca, la data scelta...): cambiandolo l'effetto riparte da
 * solo, CON il suo cleanup. È il motivo per cui le schermate non devono
 * aggiungere un useEffect che richiama reload(): quello scarterebbe il cleanup,
 * e una risposta lenta di un filtro precedente sovrascriverebbe i dati di
 * quello corrente.
 */
export function useFocusData<T>(loader: () => Promise<T>): FocusData<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const dataRef = useRef<T | null>(null);
  /*
   * Quando la sincronizzazione porta righe nuove, la schermata aperta le ha
   * gia' lette e mostrerebbe i valori di prima finche' non si naviga via e si
   * torna. Entrando fra le dipendenze di `run`, la revisione fa ripartire il
   * caricamento con il suo cleanup, come qualunque altro cambio di loader.
   */
  const syncRevision = useSyncStore((s) => s.revision);

  const run = useCallback(() => {
    let active = true;
    // Spinner solo al primo caricamento: se ho gia' dati (re-focus), li tengo a
    // schermo e ricarico in sottofondo, cosi' non lampeggia il loader ogni volta.
    if (dataRef.current === null) setLoading(true);
    (async () => {
      try {
        const result = await loader();
        if (active) {
          dataRef.current = result;
          setData(result);
        }
      } catch (error) {
        logger.error("[useFocusData] errore caricamento", error);
        // Senza questo la schermata restava identica a una senza dati: chi
        // guardava un diario vuoto per un errore di lettura non aveva modo di
        // distinguerlo da un giorno in cui non ha mangiato niente.
        if (active) showToast.error({ title: i18n.t("load_failed") });
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
    // `syncRevision` non si legge nel corpo: serve a cambiare l'IDENTITA' di
    // `run`, cosi' `useFocusEffect` lo rilancia con il suo cleanup quando la
    // sincronizzazione porta righe nuove. Toglierlo, come chiede la regola,
    // rimetterebbe la schermata aperta a mostrare i valori di prima.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loader, syncRevision]);

  useFocusEffect(run);

  return { data, loading, reload: run };
}
