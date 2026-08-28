import { average, buildSparkline, movingAverage } from "@/src/domain/stats";

describe("average", () => {
  it("media di valori presenti", () => {
    expect(average([2, 4, 6])).toBe(4);
  });

  it("su lista vuota ritorna null, non zero", () => {
    // Zero significherebbe "media zero"; null significa "nessun dato".
    expect(average([])).toBeNull();
  });

  it("ignora i giorni senza misura", () => {
    expect(average([10, null, 20])).toBe(15);
  });

  it("se non c'è nessuna misura ritorna null", () => {
    expect(average([null, null])).toBeNull();
  });
});

describe("movingAverage", () => {
  it("media mobile su finestra piena", () => {
    expect(movingAverage([1, 2, 3, 4, 5], 3)).toEqual([1, 1.5, 2, 3, 4]);
  });

  it("con finestra 1 restituisce la serie", () => {
    expect(movingAverage([3, 7], 1)).toEqual([3, 7]);
  });

  it("su serie vuota ritorna vuoto", () => {
    expect(movingAverage([], 3)).toEqual([]);
  });
});

describe("buildSparkline", () => {
  it("normalizza i punti nell'area indicata", () => {
    const points = buildSparkline([10, 20, 30], 100, 50);
    expect(points).toHaveLength(3);
    // Il minimo sta in basso, il massimo in alto (y cresce verso il basso).
    expect(points[0].y).toBeCloseTo(50);
    expect(points[2].y).toBeCloseTo(0);
    expect(points[0].x).toBe(0);
    expect(points[2].x).toBe(100);
  });

  it("con un solo punto lo mette al centro in orizzontale", () => {
    const points = buildSparkline([42], 100, 50);
    expect(points).toEqual([{ x: 50, y: 25 }]);
  });

  it("con valori tutti uguali disegna una linea a metà altezza", () => {
    const points = buildSparkline([5, 5, 5], 100, 50);
    expect(points.every((p) => p.y === 25)).toBe(true);
  });

  it("su serie vuota ritorna vuoto", () => {
    expect(buildSparkline([], 100, 50)).toEqual([]);
  });
});
