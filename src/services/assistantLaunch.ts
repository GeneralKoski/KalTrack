import { logger } from "@/src/utils/logger";
import * as Linking from "expo-linking";
import { useEffect, useState } from "react";

/**
 * Apertura dell'assistente da fuori dall'app.
 *
 * L'assistente è una schermata dell'app, non un'activity di sistema: perché
 * "lo apri, ci parli e fa le cose" valga anche partendo dalla home del
 * telefono, serve un indirizzo che il sistema possa aprire. Quell'indirizzo è
 * `kaltrack://assistente`, ed è quel che punta la scorciatoia dell'icona.
 *
 * Il contatore non è un booleano di proposito: due invocazioni di fila devono
 * riaprire l'ascolto due volte, e con un flag la seconda non cambierebbe stato.
 */

const ASSISTANT_HOSTS = ["assistente", "assistant"];

/**
 * True se l'URL chiede di aprire l'assistente.
 *
 * Il confronto è fatto a mano e non con `Linking.parse` perché quello legge il
 * manifest Expo a runtime: dipenderci renderebbe questa riga - la sola che
 * decide se il microfono parte - impossibile da verificare in un test.
 */
export const isAssistantUrl = (url: string): boolean => {
  const match = /^[a-z][a-z0-9+.-]*:\/\/([^/?#]*)/i.exec(url.trim());
  if (!match) return false;
  const host = match[1].replace(/\/+$/, "").toLowerCase();
  return ASSISTANT_HOSTS.includes(host);
};

/**
 * Quante volte è stato chiesto di aprire l'assistente da un link.
 *
 * Copre entrambi i modi in cui un link arriva: l'app era chiusa e il link l'ha
 * avviata, oppure era già aperta e il sistema le consegna l'evento. Senza il
 * primo caso la scorciatoia funzionerebbe solo la seconda volta.
 */
export function useAssistantLaunch(): number {
  const [requests, setRequests] = useState(0);

  useEffect(() => {
    let active = true;

    Linking.getInitialURL()
      .then((url) => {
        if (active && url && isAssistantUrl(url)) setRequests((n) => n + 1);
      })
      .catch((error) => {
        logger.warn("[assistente] lettura URL iniziale fallita", error);
      });

    const subscription = Linking.addEventListener("url", ({ url }) => {
      if (isAssistantUrl(url)) setRequests((n) => n + 1);
    });

    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  return requests;
}
