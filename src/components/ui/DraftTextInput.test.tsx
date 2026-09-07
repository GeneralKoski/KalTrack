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
