import { RoutineListItem } from "@/src/containers/gym/RoutineListItem";
import type { RoutineRow } from "@/src/types/gym";
import React from "react";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

function routine(overrides: Partial<RoutineRow> = {}): RoutineRow {
  return {
    id: "r1",
    name: "Push",
    is_active: 0,
    notes: null,
    generated_by_ai: 0,
    position: 0,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    deleted_at: null,
    ...overrides,
  };
}

/**
 * F2 della review di fase (meta' A): il gesto di trascinamento e' passato al
 * `GestureDetector` dentro la riga. Cancellando quel `GestureDetector` - la
 * mutazione descritta nella review - la riga si disegna nuda e il
 * trascinamento non parte mai, con la suite verde. Un gesto non gira in jest
 * (`TODO.md` § 6.1), quindi qui si pinna solo il CABLAGGIO: che il gesto
 * ricevuto sia reso, non la sua semantica - gia' coperta da `movePosition`.
 */
describe("RoutineListItem, il cablaggio del trascinamento", () => {
  it("con un dragGesture rende il GestureDetector", () => {
    const gesture = Gesture.Pan();
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = create(
        <RoutineListItem
          routine={routine()}
          dayCount={2}
          onPress={() => {}}
          onActivate={() => {}}
          onDelete={() => {}}
          dragGesture={gesture}
        />,
      );
    });

    expect(renderer.root.findAllByType(GestureDetector).length).toBe(1);

    act(() => {
      renderer.unmount();
    });
  });

  it("senza dragGesture non rende nessun GestureDetector", () => {
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = create(
        <RoutineListItem
          routine={routine()}
          dayCount={2}
          onPress={() => {}}
          onActivate={() => {}}
          onDelete={() => {}}
        />,
      );
    });

    expect(renderer.root.findAllByType(GestureDetector).length).toBe(0);

    act(() => {
      renderer.unmount();
    });
  });
});
