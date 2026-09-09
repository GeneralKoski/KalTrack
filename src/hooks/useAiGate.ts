import { aiAvailable } from "@/src/domain/aiAccess";
import { useAppNav } from "@/src/hooks/useAppNav";
import { useAccountStore } from "@/src/stores/accountStore";
import { useEffect } from "react";

/**
 * Il diritto AI adesso, come booleano.
 *
 * Serve a chi deve SAPERLO senza navigare da nessuna parte: un componente
 * che sa gia' degradare da solo a un comportamento locale e onesto (vedi
 * `AlternativesSheet`, che senza `rank` mostra comunque l'elenco filtrato in
 * locale) non deve essere spedito su una pagina di vendita - gli basta non
 * ricevere l'extra AI.
 */
export function useAiAvailable(): boolean {
  const token = useAccountStore((s) => s.token);
  const aiEnabled = useAccountStore((s) => s.aiEnabled);
  const isHydrated = useAccountStore((s) => s.isHydrated);
  return aiAvailable({ token, aiEnabled, isHydrated });
}

/**
 * Il cancello dell'AI, in un posto solo.
 *
 * `aiAvailable()` e' la funzione pura che decide (`domain/aiAccess.ts`);
 * questo hook e' la meta' React che i punti d'ingresso condividono per non
 * ripetere la stessa condizione una volta per file - copie separate sono
 * occasioni di divergere, ed e' la ragione per cui la prima meta' e' gia' una
 * funzione sola.
 *
 * Restituisce una funzione che esegue l'azione se il diritto c'e', o naviga
 * alla pagina dei piani se no. L'elemento che la chiama resta visibile e
 * toccabile come sempre: e' UN CARTELLO, NON UNA SERRATURA (§ AI di
 * CLAUDE.md) - cambia solo dove porta il tocco, non se si vede.
 *
 * E' per le azioni che SONO la funzione AI (il microfono, la stima da foto,
 * la generazione scheda, la lettura etichetta): li' senza diritto non resta
 * niente da fare se non vendere l'abbonamento. Non e' per un extra sopra una
 * funzione che gia' funziona da sola (vedi `useAiAvailable` sopra) - navigare
 * via da li' toglierebbe una funzione locale a chi non ha ancora il diritto,
 * invece di togliergli solo il di piu' che l'AI aggiunge.
 */
export function useAiGate() {
  const available = useAiAvailable();
  const { navigate } = useAppNav();

  return (action: () => void | Promise<void>) => {
    if (available) {
      void action();
    } else {
      navigate("Plans");
    }
  };
}

/**
 * Il cancello per una schermata INTERA, non per un bottone.
 *
 * `useAiGate` protegge il tocco che ci naviga, ma una schermata registrata
 * con un `linking.path` e' raggiungibile anche da un deep link diretto, che
 * scavalca qualunque gate messo su un bottone che porta li' - la stessa
 * porta seconda che `kaltrack://assistente` era per il microfono, chiusa
 * gia' una volta per il deep link dell'assistente. `GenerateRoutine`
 * (`schede/genera`) e' nella stessa situazione: il banner in
 * `RoutineFormScreen` la gia', ma il percorso diretto no.
 *
 * Naviga a `Plans` con `replace` (non `navigate`) appena la schermata monta
 * senza diritto, cosi' non resta in cronologia una schermata gated su cui
 * "indietro" tornerebbe. Ritorna il booleano perche' la schermata deve
 * comunque decidere cosa disegnare nell'istante fra il mount e la
 * sostituzione - `null` e' la risposta giusta, non il proprio contenuto.
 */
export function useAiScreenGate(): boolean {
  const available = useAiAvailable();
  const { replace } = useAppNav();

  useEffect(() => {
    if (!available) replace("Plans");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [available]);

  return available;
}
