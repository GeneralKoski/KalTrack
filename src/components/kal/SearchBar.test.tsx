import { SearchBar } from "@/src/components/kal/SearchBar";
import React from "react";
import { TextInput as RNTextInput } from "react-native";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

/**
 * Questo campo e' lo stesso in otto punti dell'app, e non ha stato proprio: il
 * termine vive nel chiamante, che sotto ha sempre una lista. Se quel giro non
 * chiude entro il fotogramma il `value` torna indietro di un carattere e RN
 * riscrive il campo nativo - la digitazione che perde caratteri e riporta il
 * cursore a inizio riga.
 *
 * `CLAUDE.md` ha dichiarato questa barra un'eccezione legittima fino al 9
 * settembre 2026: questi due test sono la ragione per cui non lo e'.
 */
const campo = (renderer: ReactTestRenderer) =>
  renderer.root.findByType(RNTextInput);

const scrivi = (renderer: ReactTestRenderer, text: string) =>
  act(() => {
    campo(renderer).props.onChangeText(text);
  });

describe("SearchBar", () => {
  it("tiene quel che si digita anche se il chiamante ridisegna in ritardo", () => {
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = create(<SearchBar value="" onChangeText={() => {}} />);
    });

    scrivi(renderer, "zuc");
    scrivi(renderer, "zucc");
    scrivi(renderer, "zucch");

    // La schermata con la lista ha chiuso il suo giro solo ora, ferma a due
    // tasti fa: quel valore e' un'eco in ritardo, non una notizia.
    act(() => {
      renderer.update(<SearchBar value="zuc" onChangeText={() => {}} />);
    });

    expect(campo(renderer).props.value).toBe("zucch");
  });

  /**
   * L'altra meta': i fogli che portano questa barra (`AddEntrySheet`,
   * `IngredientPicker`, `EntryCompositionSheet`, `ExercisePickerSheet`)
   * svuotano il termine alla chiusura e dopo una scelta. Quello svuotamento
   * deve arrivare nel campo.
   */
  it("accetta lo svuotamento che il foglio fa alla chiusura", () => {
    let renderer!: ReactTestRenderer;
    const render = (value: string) => (
      <SearchBar value={value} onChangeText={() => {}} />
    );
    act(() => {
      renderer = create(render(""));
    });

    scrivi(renderer, "zucchine");
    act(() => {
      renderer.update(render("zucchine"));
    });
    act(() => {
      renderer.update(render(""));
    });

    expect(campo(renderer).props.value).toBe("");
  });
});
