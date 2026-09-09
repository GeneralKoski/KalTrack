import { HistoryList, type HistoryListItem } from "@/src/containers/progress/HistoryList";
import React from "react";
import { TouchableOpacity } from "react-native";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { Check } from "lucide-react-native";

/*
 * Il barrel `kal` porta `PhotoField` -> `DfBottomSheet` -> @gorhom/bottom-sheet
 * -> reanimated/worklets, che sotto Jest lancia (vedi lo stesso commento in
 * StepsHistoryScreen.test.tsx). `HistoryList` usa solo `ListGroup` e
 * `HistoryRow`, quindi il mock li ri-espone veri e lascia fuori il resto.
 */
jest.mock("@/src/components/kal", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const listGroup = require("@/src/components/kal/ListGroup");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const historyRow = require("@/src/components/kal/HistoryRow");
  return {
    ListGroup: listGroup.ListGroup,
    HistoryRow: historyRow.HistoryRow,
    NO_DELTA: historyRow.NO_DELTA,
  };
});

const items: HistoryListItem[] = [
  { id: "2026-09-08", date: "2026-09-08", value: "2.100 kcal", delta: "—" },
  { id: "2026-09-07", date: "2026-09-07", value: "1.950 kcal", delta: "-150" },
];

describe("HistoryList, selezione presente (peso e passi)", () => {
  it("chiama onPress/onLongPress con la data e disegna la spunta come prima", () => {
    const onPress = jest.fn();
    const onLongPress = jest.fn();
    const selected = new Set(["2026-09-08"]);

    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = create(
        <HistoryList
          items={items}
          selected={selected}
          onPress={onPress}
          onLongPress={onLongPress}
        />,
      );
    });

    const rows = renderer.root.findAllByType(TouchableOpacity);
    expect(rows).toHaveLength(2);

    act(() => {
      rows[0].props.onPress();
    });
    expect(onPress).toHaveBeenCalledWith("2026-09-08");

    act(() => {
      rows[1].props.onLongPress();
    });
    expect(onLongPress).toHaveBeenCalledWith("2026-09-07");

    // In selezione (selected.size > 0) ogni riga porta il cerchietto della
    // spunta, e solo la riga selezionata mostra il segno di conferma.
    expect(renderer.root.findAllByType(Check)).toHaveLength(1);

    act(() => {
      renderer.unmount();
    });
  });
});

describe("HistoryList, selezione assente (calorie)", () => {
  it("non disegna la spunta e non avvolge le righe in un TouchableOpacity", () => {
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = create(<HistoryList items={items} />);
    });

    expect(renderer.root.findAllByType(TouchableOpacity)).toHaveLength(0);
    expect(renderer.root.findAllByType(Check)).toHaveLength(0);

    act(() => {
      renderer.unmount();
    });
  });
});
