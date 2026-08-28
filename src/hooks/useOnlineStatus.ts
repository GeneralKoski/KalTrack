import {
  addNetworkStateListener,
  getNetworkStateAsync,
  type NetworkState,
} from "expo-network";
import { useEffect, useState } from "react";
import { AppState } from "react-native";

// Ottimista: online finché non SAPPIAMO di essere offline. Se un campo è ancora
// ignoto (undefined) lo si tratta come online per evitare il flash iniziale.
function deriveOnline(
  state: Pick<NetworkState, "isConnected" | "isInternetReachable">,
): boolean {
  return state.isConnected !== false && state.isInternetReachable !== false;
}

// Stato online reattivo e robusto. `useNetworkState()` di expo-network legge lo
// stato una sola volta al mount e poi si affida SOLO agli eventi nativi di
// NWPathMonitor. Sul simulatore iOS quegli eventi NON scattano al toggle del
// wi-fi dell'host (il simulatore usa lo stack di rete del Mac), quindi una
// pagina già aperta non rileva mai il cambio: solo un reload o l'apertura di
// una nuova pagina rileggono lo stato. Qui, oltre a sottoscrivere gli eventi,
// si ri-legge lo stato con getNetworkStateAsync al foreground e a intervalli
// regolari (chiamata nativa leggera, non una richiesta di rete).
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    let active = true;
    const apply = (
      state: Pick<NetworkState, "isConnected" | "isInternetReachable">,
    ) => {
      if (active) setOnline(deriveOnline(state));
    };
    const check = () => {
      getNetworkStateAsync().then(apply).catch(() => {});
    };

    check();
    const listener = addNetworkStateListener(apply);
    const appState = AppState.addEventListener("change", (next) => {
      if (next === "active") check();
    });

    return () => {
      active = false;
      listener.remove();
      appState.remove();
    };
  }, []);

  return online;
}
