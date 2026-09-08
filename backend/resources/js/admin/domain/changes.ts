/**
 * Cosa e' cambiato fra come la proposta e' arrivata e come la si approva.
 *
 * Serve perche' `approve` accetta le correzioni nello stesso corpo
 * dell'approvazione - in revisione si corregge MENTRE si guarda - e i campi
 * che nessuno ha toccato non vanno rimandati: `SubmissionController::
 * applicaCorrezioni` scrive quel che riceve, e mandare tutto vorrebbe dire
 * riscrivere il nome (e passare dal controllo di unicita' su `name_norm`) di
 * una voce a cui il nome non e' stato toccato.
 *
 * Il confronto e' su valori scalari, che e' tutto quel che questi form
 * producono: gli elenchi (`equipment`, `secondaryMuscles`) arrivano qui gia'
 * ridotti a stringa da `joinCsv`.
 */
export function changedFields<T extends Record<string, unknown>>(prima: T, dopo: T): Partial<T> {
    const cambiati: Partial<T> = {};

    for (const chiave of Object.keys(dopo) as (keyof T)[]) {
        if (!Object.is(prima[chiave], dopo[chiave])) {
            cambiati[chiave] = dopo[chiave];
        }
    }

    return cambiati;
}
