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
 * QUANDO USARE QUESTO E NON `useAiGate`: quando la schermata di destinazione
 * e' registrata con un suo `linking.path` - cioe' e' una rotta a se',
 * raggiungibile anche da un deep link diretto che scavalca qualunque gate
 * messo sul bottone che normalmente ci naviga. Un bottone gated impedisce di
 * ARRIVARCI da dentro l'app; non impedisce di finirci comunque da fuori. Se
 * il punto d'ingresso invece non naviga a una rotta propria - apre un
 * overlay, un modale, uno sheet - `useAiGate` sul tocco basta, perche' non
 * c'e' una seconda porta da chiudere.
 *
 * E' la stessa identica situazione gia' vista e chiusa una volta per il
 * microfono: il tocco su `AssistantButton` era gated, ma
 * `kaltrack://assistente` apriva l'ascolto scavalcandolo - due porte sulla
 * stessa stanza, una aperta. `GenerateRoutine` (`linking.path: "schede/genera"`)
 * ha lo stesso difetto: il banner in `RoutineFormScreen` gia' gatiava il
 * tocco che ci naviga, ma il deep link diretto no. Li' l'assistente ha
 * risolto gatando anche l'effetto del deep link (stessa schermata, due
 * ingressi); qui la soluzione e' questo hook, perche' `GenerateRoutine` e'
 * una schermata a se' e non un effetto dentro un componente gia' montato.
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
