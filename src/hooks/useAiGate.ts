import { aiAvailable } from "@/src/domain/aiAccess";
import { useAppNav } from "@/src/hooks/useAppNav";
import { useAccountStore } from "@/src/stores/accountStore";

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
 */
export function useAiGate() {
  const token = useAccountStore((s) => s.token);
  const aiEnabled = useAccountStore((s) => s.aiEnabled);
  const { navigate } = useAppNav();

  return (action: () => void | Promise<void>) => {
    if (aiAvailable({ token, aiEnabled })) {
      void action();
    } else {
      navigate("Plans");
    }
  };
}
