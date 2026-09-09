import { DraftTextInput } from "@/src/components/ui/DraftTextInput";
import { sanitizeDecimalInput } from "@/src/utils/utils";
import React from "react";
import { TextInput as RNTextInput } from "react-native";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

/**
 * Il contratto di questo campo non si vede leggendolo: sta in COSA succede
 * quando il chiamante torna con un valore diverso da quello a schermo. Il
 * difetto che questi test bloccano e' la digitazione che perdeva caratteri e
 * riportava il cursore a inizio riga, perche' il `value` arrivava indietro di
 * un giro e RN riscriveva il campo nativo.
 */
const campo = (renderer: ReactTestRenderer) =>
  renderer.root.findByType(RNTextInput);

const scrivi = (renderer: ReactTestRenderer, text: string) =>
  act(() => {
    campo(renderer).props.onChangeText(text);
  });

describe("DraftTextInput", () => {
  it("mostra subito quel che si digita e lo consegna al chiamante", () => {
    const consegnato: string[] = [];
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = create(
        <DraftTextInput value="" onChangeText={(v) => consegnato.push(v)} />,
      );
    });

    scrivi(renderer, "pa");
    scrivi(renderer, "pan");

    expect(campo(renderer).props.value).toBe("pan");
    expect(consegnato).toEqual(["pa", "pan"]);
  });

  /** Il cuore della faccenda: il chiamante in ritardo non riscrive il campo. */
  it("ignora un valore vecchio che il chiamante rimanda in ritardo", () => {
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = create(<DraftTextInput value="" onChangeText={() => {}} />);
    });

    scrivi(renderer, "pa");
    scrivi(renderer, "pan");
    scrivi(renderer, "pane");

    // La schermata sopra ha chiuso il suo giro solo ora, ferma a due tasti fa.
    act(() => {
      renderer.update(<DraftTextInput value="pa" onChangeText={() => {}} />);
    });

    expect(campo(renderer).props.value).toBe("pane");
  });

  /** ...ma un valore che non viene da noi entra: e' l'altra meta' del patto. */
  it("si riallinea a un valore cambiato da fuori", () => {
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = create(<DraftTextInput value="" onChangeText={() => {}} />);
    });

    scrivi(renderer, "pan");
    act(() => {
      renderer.update(
        <DraftTextInput value="Push A" onChangeText={() => {}} />,
      );
    });

    expect(campo(renderer).props.value).toBe("Push A");
  });

  /**
   * Lo svuotamento che i fogli fanno alla chiusura: e' una stringa vuota come
   * quella che consegniamo cancellando, e va distinta da quella.
   */
  it("accetta lo svuotamento voluto dopo che il chiamante ci ha raggiunti", () => {
    let renderer!: ReactTestRenderer;
    const render = (value: string) => (
      <DraftTextInput value={value} onChangeText={() => {}} />
    );
    act(() => {
      renderer = create(render(""));
    });

    scrivi(renderer, "pane");
    // Il chiamante ha registrato quel che gli abbiamo detto...
    act(() => {
      renderer.update(render("pane"));
    });
    // ...e alla chiusura svuota.
    act(() => {
      renderer.update(render(""));
    });

    expect(campo(renderer).props.value).toBe("");
  });

  /**
   * Lo svuotamento dei fogli con la CODA ANCORA PIENA, che da quando la
   * `SearchBar` passa da qui non e' piu' un caso di scuola: cinque degli otto
   * chiamanti svuotano il termine alla chiusura o dopo una scelta.
   *
   * Qui il chiamante e' rimasto indietro di due battute e poi svuota: quel
   * vuoto non e' fra le echi in coda, quindi entra nel campo e la coda si
   * butta. Riaprire il foglio non deve mostrare la ricerca di prima.
   */
  it("accetta lo svuotamento anche con le echi ancora in coda", () => {
    let renderer!: ReactTestRenderer;
    const render = (value: string) => (
      <DraftTextInput value={value} onChangeText={() => {}} />
    );
    act(() => {
      renderer = create(render(""));
    });

    scrivi(renderer, "zuc");
    scrivi(renderer, "zucc");
    scrivi(renderer, "zucch");
    // Il chiamante arriva al primo carattere...
    act(() => {
      renderer.update(render("zuc"));
    });
    // ...e poi svuota di proposito, con due echi ancora in coda.
    act(() => {
      renderer.update(render(""));
    });

    expect(campo(renderer).props.value).toBe("");
  });

  /**
   * Il confine, ed e' scritto qui perche' spostarlo rompe il test sopra.
   *
   * Se il valore del chiamante **non cambia** fra prima e dopo - il vuoto di
   * partenza e il vuoto voluto sono la stessa stringa - da queste prop non si
   * puo' sapere che sia successo qualcosa: lo stato (`value` fermo, una battuta
   * in coda) e' identico a quello di un chiamante che non ha ancora
   * ridisegnato, e ridisegnare il campo li' vuol dire riportarsi indietro il
   * carattere appena scritto, cioe' il difetto che questo componente esiste per
   * togliere.
   *
   * Nell'app non si raggiunge: React chiude un commit fra due eventi nativi,
   * quindi la battuta e il tocco che svuota non stanno mai nello stesso giro -
   * il caso di sopra e' quello vero. E i fogli gorhom smontano il contenuto
   * alla chiusura, quindi riaprendoli il campo riparte comunque da zero.
   */
  it("non puo' vedere uno svuotamento che lascia il valore del chiamante fermo", () => {
    let renderer!: ReactTestRenderer;
    const render = (value: string) => (
      <DraftTextInput value={value} onChangeText={() => {}} />
    );
    act(() => {
      renderer = create(render(""));
    });

    scrivi(renderer, "zucchine");
    act(() => {
      renderer.update(render(""));
    });

    expect(campo(renderer).props.value).toBe("zucchine");
  });

  /**
   * `AccountForm` porta il cursore al campo dopo con l'invio, e per farlo gli
   * serve il campo nativo. Non c'e' `forwardRef` qui: la prop `ref` cavalca lo
   * spread fino a `ui/TextInput`, e questo test e' la prova che ci arriva -
   * senza, il modulo dell'accesso non poteva usare questo campo.
   */
  it("consegna il campo nativo a chi passa un `ref`", () => {
    const ref = React.createRef<RNTextInput>();
    act(() => {
      create(<DraftTextInput ref={ref} value="" onChangeText={() => {}} />);
    });

    expect(ref.current).not.toBeNull();
    expect(typeof ref.current?.focus).toBe("function");
  });

  it("ripulisce il testo con `sanitize` prima di tenerlo e consegnarlo", () => {
    const consegnato: string[] = [];
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = create(
        <DraftTextInput
          value=""
          sanitize={sanitizeDecimalInput}
          onChangeText={(v) => consegnato.push(v)}
        />,
      );
    });

    scrivi(renderer, "12,5,");

    expect(campo(renderer).props.value).toBe("12,5");
    expect(consegnato).toEqual(["12,5"]);
  });
});
