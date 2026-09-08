import { AlternativesSheet } from "@/src/containers/gym/AlternativesSheet";
import type { ExerciseRow } from "@/src/types/gym";
import React from "react";
import { Text as RNText } from "react-native";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

/*
 * Il foglio vero passa da @gorhom/bottom-sheet, che qui non serve: quel che
 * si vuole verificare e' la logica di AlternativesSheet (quali righe finisce
 * per mostrare), non la meccanica del foglio. Il mock rende solo i children.
 */
jest.mock("@/src/components/DfBottomSheet", () => {
  // jest issa jest.mock in cima al file, prima di ogni import: la fabbrica
  // non puo' leggere il modulo React importato sotto, e deve richiederselo
  // da se'.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ReactLib = require("react");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require("react-native");
  return {
    DfBottomSheet: ReactLib.forwardRef(
      ({ children }: { children: React.ReactNode }, _ref: unknown) =>
        ReactLib.createElement(View, null, children),
    ),
  };
});

const alternative: ExerciseRow = {
  id: "ex-alt",
  name: "Panca inclinata manubri",
  name_norm: "panca inclinata manubri",
  muscle_group: "petto",
  secondary_muscles: null,
  equipment: null,
  is_custom: 0,
  is_banned: 0,
  dislike_level: 0,
  notes: null,
  instructions: null,
  photo_uri: null,
  catalog_uid: null,
  usage_count: 0,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  deleted_at: null,
};

const exercise: ExerciseRow = { ...alternative, id: "ex-1", name: "Panca piana bilanciere" };

const mockSuggestAlternatives = jest.fn(async () => [alternative]);
jest.mock("@/src/db/queries/exercises", () => ({
  suggestAlternatives: (...args: unknown[]) =>
    mockSuggestAlternatives(...(args as [])),
}));

beforeEach(() => {
  mockSuggestAlternatives.mockClear();
});

describe("AlternativesSheet senza il riordino AI", () => {
  /**
   * `rank` e' opzionale (§ La ricerca delle alternative di CLAUDE.md): senza
   * diritto AI, `SessionScreen` non lo passa piu', ma il pulsante resta vivo
   * e il foglio si apre comunque. Questo e' il contratto che quella scelta
   * presuppone - un elenco POPOLATO, non solo "non ha navigato da nessuna
   * parte": il filtro locale decide gia' da solo cosa e' possibile.
   */
  it("mostra comunque l'elenco filtrato in locale, non vuoto", async () => {
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <AlternativesSheet exercise={exercise} onPick={jest.fn()} />,
      );
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockSuggestAlternatives).toHaveBeenCalledWith(
      "ex-1",
      expect.objectContaining({ onlyAvailableEquipment: false }),
    );

    const texts = renderer.root
      .findAllByType(RNText)
      .flatMap((node) => (Array.isArray(node.props.children) ? node.props.children : [node.props.children]));
    expect(texts).toContain("Panca inclinata manubri");
  });
});
