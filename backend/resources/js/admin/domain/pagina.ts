/**
 * Il numero di pagina scritto nella URL, o 1.
 *
 * `Number(parametri.get('page') ?? '1')` da' `NaN` su `?page=abc`, e quel
 * `NaN` finiva sia nella query verso il server sia in `current` della tabella
 * di AntD: due posti che non se lo aspettano, per un valore che chiunque puo'
 * scrivere nella barra degli indirizzi.
 *
 * Si scarta anche uno zero, un negativo e un decimale: la prima pagina e' la
 * uno, e non esiste una pagina 1,5.
 */
export function numeroPagina(grezzo: string | null): number {
    const numero = Number(grezzo);

    return Number.isInteger(numero) && numero >= 1 ? numero : 1;
}
