import {
  ALWAYS_AVAILABLE_EQUIPMENT,
  DEFAULT_MUSCLE_GROUP,
  UNKNOWN_MUSCLE_GROUP,
  type SeedEquipment,
  type SeedMuscleGroup,
} from "@/src/types/gym";

/**
 * Le tre costanti nate da dbd8bb9 (`DEFAULT_MUSCLE_GROUP`,
 * `UNKNOWN_MUSCLE_GROUP`, `ALWAYS_AVAILABLE_EQUIPMENT`) restituiscono al
 * compilatore il controllo che allargare `MuscleGroup`/`Equipment` a
 * `string` aveva tolto: un refuso in uno di questi letterali non compila
 * piu'. Ma quel controllo vive nell'ANNOTAZIONE di tipo, non nel valore -
 * "petto" e' "petto" sia che la riga dica `: SeedMuscleGroup` sia che dica
 * `: string` - quindi un'assegnazione `it("...")` non se ne accorgerebbe
 * mai: il refuso che dbd8bb9 chiude tornerebbe muto.
 *
 * Le tre righe sotto sono il guardiano: assegnano ciascuna costante a una
 * variabile tipata `SeedMuscleGroup`/`SeedEquipment[]`. Se una delle tre
 * costanti perdesse l'annotazione stretta - riscritta come `string` o
 * `string[]` - l'assegnazione smette di compilare e `npm run typecheck`
 * torna rosso, anche se `npm test` da solo non lo vedrebbe (jest trasforma
 * con babel e non controlla i tipi).
 */
const pinnaDefault: SeedMuscleGroup = DEFAULT_MUSCLE_GROUP;
const pinnaSconosciuto: SeedMuscleGroup = UNKNOWN_MUSCLE_GROUP;
const pinnaAttrezzatura: SeedEquipment[] = ALWAYS_AVAILABLE_EQUIPMENT;

describe("le costanti scritte a mano restano tipate sul seme, non su string", () => {
  it("sono ancora i valori dichiarati", () => {
    expect(pinnaDefault).toBe("petto");
    expect(pinnaSconosciuto).toBe("full_body");
    expect(pinnaAttrezzatura).toEqual(["corpo_libero"]);
  });
});
