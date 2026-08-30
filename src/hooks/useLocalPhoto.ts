import { ensureLocalPhoto } from "@/src/services/photoSync";
import { useEffect, useState } from "react";

/**
 * Il percorso locale di una foto, scaricandola se su questo telefono non c'e'.
 *
 * Serve perche' la sincronizzazione porta le RIGHE e non i file: una ricetta
 * fotografata sull'altro telefono arriva qui con il percorso di un file che
 * qui non esiste. Prima era un rettangolo vuoto senza spiegazione.
 *
 * Torna `null` finche' non c'e' niente da mostrare - in arrivo, o mai
 * caricata dal telefono che l'ha scattata - cosi' chi disegna puo' mettere il
 * segnaposto invece di un'immagine rotta.
 */
export function useLocalPhoto(uri: string | null | undefined): string | null {
  const [risolto, setRisolto] = useState<string | null>(null);

  useEffect(() => {
    let attivo = true;
    if (!uri) {
      setRisolto(null);
      return;
    }

    // Non si azzera prima di cercare: per la foto che e' gia' qui - il caso
    // normale - azzerare farebbe lampeggiare il segnaposto a ogni disegno.
    void ensureLocalPhoto(uri).then((percorso) => {
      if (attivo) setRisolto(percorso);
    });

    return () => {
      attivo = false;
    };
  }, [uri]);

  return risolto;
}
