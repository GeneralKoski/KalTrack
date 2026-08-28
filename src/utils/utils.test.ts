import { theme } from "@/src/styles";

describe("setup", () => {
  it("risolve l'alias @/ e carica i token del tema", () => {
    expect(theme.spacing.md).toBe(16);
    expect(theme.colors.white).toBe("#ffffff");
  });
});
