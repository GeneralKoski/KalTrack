/** Le kcal che i macro dichiarati spiegano: 4 per grammo di proteine e carboidrati, 9 per i grassi. */
export function kcalFromMacros(
    protein: number | null,
    carbs: number | null,
    fat: number | null,
): number {
    return Math.round((protein ?? 0) * 4 + (carbs ?? 0) * 4 + (fat ?? 0) * 9);
}

/**
 * Le kcal scritte litigano con i macro scritti?
 *
 * Non e' una validazione e non blocca il salvataggio: la formula non conosce
 * fibre, polioli e alcol, e su un prodotto vero uno scarto di qualche punto e'
 * normale. Serve a intercettare la virgola sbagliata - 400 kcal su macro che
 * ne spiegano 165 - che e' l'errore che poi si porta dietro ogni pasto
 * registrato con quell'alimento.
 *
 * Due soglie insieme: il dieci per cento, e venti kcal in assoluto. Solo la
 * percentuale farebbe gridare per due kcal su venti; solo il valore assoluto
 * tacerebbe su cinquanta kcal di scarto su ottocento.
 */
export function macrosDiverge(kcal: number | null, daiMacro: number): boolean {
    if (kcal === null || daiMacro === 0) {
        return false;
    }

    const scarto = Math.abs(kcal - daiMacro);

    return scarto > 20 && scarto > kcal * 0.1;
}
