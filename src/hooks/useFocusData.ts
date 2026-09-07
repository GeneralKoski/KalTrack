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
  /**
   * Ricarica **attesa**, per il pull-to-refresh: risolve quando i dati nuovi
   * sono a schermo, che e' quello che un `RefreshControl` deve sapere per
   * smettere di girare. `reload` non lo puo' dire - torna la funzione di
   * pulizia dell'effetto, non una promessa.
   */
  refresh: () => Promise<void>;
  /** Vero mentre `refresh` e' in volo: si passa a `RefreshControl`. */
  refreshing: boolean;
}

/**
 * Carica i dati al focus della schermata e ogni volta che il loader cambia.
 *
 * Quasi sempre il loader legge da SQLite (local-first), ma non e' un vincolo
 * del hook: il profilo di un amico, per esempio, e' una richiesta di rete - il
 * server e' l'unico che sa cosa quella persona sta condividendo oggi.
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
  const [refreshing, setRefreshing] = useState(false);
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

  /*
   * Non riusa `run`, e non e' una dimenticanza: `run` e' fatto per
   * `useFocusEffect`, quindi torna il proprio cleanup e non c'e' modo di sapere
   * quando ha finito. Qui invece serve la fine del caricamento, e serve senza
   * toccare `loading`: quello alza lo spinner a tutta pagina, e un pull che
   * sostituisce quel che stai guardando con uno spinner e' peggio di nessun
   * pull. I dati restano a schermo e si aggiornano sotto la rotella del
   * `RefreshControl`.
   */
  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const result = await loader();
      dataRef.current = result;
      setData(result);
    } catch (error) {
      logger.error("[useFocusData] errore aggiornamento", error);
      showToast.error({ title: i18n.t("load_failed") });
    } finally {
      setRefreshing(false);
    }
  }, [loader]);

  return { data, loading, reload: run, refresh, refreshing };
}
