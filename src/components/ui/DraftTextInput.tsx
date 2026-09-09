import { TextInput, type TextInputProps } from "@/src/components/ui/TextInput";
import React from "react";
import type { TextInput as RNTextInput } from "react-native";

export interface DraftTextInputProps
  extends Omit<TextInputProps, "value" | "onChangeText"> {
  /**
   * Il valore di partenza, e quello a cui il campo si riallinea quando cambia
   * da fuori. NON e' il testo che si sta digitando.
   */
  value: string;
  /** Ripulisce il testo prima di tenerlo (es. `sanitizeDecimalInput`). */
  sanitize?: (text: string) => string;
  onChangeText: (value: string) => void;
  /**
   * Il campo nativo, per chi ci porta il cursore da fuori: l'invio che passa
   * al campo dopo in `AccountForm`.
   *
   * Basta dichiararlo. Da React 19 `ref` e' una prop come le altre, quindi
   * cavalca lo spread qui sotto e arriva a `ui/TextInput`, che `forwardRef` lo
   * e' davvero: senza questa riga funzionava a runtime e non compilava
   * (TS2322), ed e' l'unica cosa che teneva `AccountForm` - dove si scrivono
   * email e password - fuori da questo campo.
   */
  ref?: React.Ref<RNTextInput>;
}

/**
 * Un campo che tiene il testo digitato accanto a se', e al chiamante ne manda
 * una copia.
 *
 * **Il difetto che esiste per evitare.** Con lo stato in cima alla schermata,
 * ogni tasto ridisegna tutta la schermata prima di restituire il carattere al
 * campo: la sessione di allenamento con tutte le sue righe, il modulo di una
 * scheda con tutti i suoi blocchi. Se quel giro non chiude entro il fotogramma,
 * RN si ritrova il `value` indietro di un carattere rispetto al testo nativo,
 * riscrive il campo con quello vecchio - e Android, riscrivendolo, riporta il
 * cursore a inizio riga. Si vede come una digitazione che salta, perde
 * caratteri e a tratti rimette del testo che non stavi scrivendo.
 *
 * Lo stato locale si aggiorna nello stesso giro della battuta, quindi il
 * `value` del nativo combacia sempre e non c'e' niente da riscrivere, per
 * quanto lenta sia la schermata sopra.
 *
 * **E si riallinea, invece di ignorare il chiamante.** Un valore che non viene
 * da noi (una scheda generata dall'IA che arriva a modulo aperto, un foglio
 * che si svuota alla chiusura, l'esercizio sostituito che cambia i carichi)
 * entra nel campo: senza questo un campo cosi' sarebbe sordo a tutto quel che
 * non si digita a mano.
 *
 * A distinguerlo da un'eco in ritardo serve la CODA di quel che abbiamo
 * consegnato, e non l'ultimo valore: il chiamante puo' tornare indietro con un
 * carattere di due tasti fa - e' proprio il ritardo che questo campo esiste per
 * assorbire - e quello va ignorato, non riscritto nel campo. Confrontare col
 * solo ultimo valore consegnato non basta nemmeno all'incontrario: uno svuotamento
 * voluto e una stringa vuota che abbiamo consegnato noi cancellando sono lo
 * stesso testo, e li distingue solo il fatto che il chiamante ci aveva gia'
 * raggiunti.
 *
 * **Il confine di quel patto**: se il valore del chiamante non CAMBIA - il
 * vuoto di partenza e il vuoto voluto sono la stessa stringa - da queste prop
 * non si puo' sapere che sia successo qualcosa, e il campo tiene quel che si
 * stava scrivendo. Non e' una dimenticanza: quello stato e' identico a quello
 * di un chiamante che non ha ancora ridisegnato, e riscrivere il campo li'
 * riporterebbe indietro il carattere appena battuto. Nell'app non si raggiunge
 * (React chiude un commit fra due eventi nativi, quindi la battuta e il tocco
 * che svuota non stanno mai nello stesso giro), e `DraftTextInput.test.tsx` lo
 * enuncia insieme al caso vero, cosi' chi prova a spostarlo vede subito cosa
 * rompe.
 */
export const DraftTextInput: React.FC<DraftTextInputProps> = ({
  value,
  sanitize,
  onChangeText,
  ...props
}) => {
  const [text, setText] = React.useState(value);
  const seen = React.useRef(value);
  /** Quel che abbiamo consegnato e il chiamante non ci ha ancora rimandato. */
  const pending = React.useRef<string[]>([]);

  // Solo un valore CAMBIATO e' una notizia: quello fermo e' il chiamante che
  // non ha ancora ridisegnato, e non dice niente sul testo nel campo.
  if (value !== seen.current) {
    seen.current = value;
    const echo = pending.current.indexOf(value);
    if (echo === -1) {
      pending.current = [];
      setText(value);
    } else {
      // Eco in ritardo: si scarta, insieme a tutte quelle prima.
      pending.current = pending.current.slice(echo + 1);
    }
  }

  const change = (next: string) => {
    const clean = sanitize ? sanitize(next) : next;
    pending.current = [...pending.current, clean];
    setText(clean);
    onChangeText(clean);
  };

  return <TextInput {...props} value={text} onChangeText={change} />;
};
