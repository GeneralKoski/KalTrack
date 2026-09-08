/**
 * `equipment` e `secondary_muscles` sono elenchi separati da virgola dentro
 * una stringa, non tabelle figlie: il server li filtra con un LIKE su
 * `',' || colonna || ','`. Il form li mostra come tendine a scelta multipla,
 * e la conversione avviene qui, ai due bordi, mai a mano in una schermata.
 */
export function splitCsv(value: string | null): string[] {
    if (value === null) {
        return [];
    }

    return value
        .split(',')
        .map((v) => v.trim())
        .filter((v) => v !== '');
}

/**
 * Un elenco vuoto vale `null` e non stringa vuota: la colonna e' nullable, e
 * il filtro del server (`',' || equipment || ','`) su una stringa vuota
 * darebbe `,,` - una riga senza attrezzi che combacia con la ricerca di un
 * attrezzo il cui slug e' vuoto. Con NULL non combacia con niente, che e'
 * quel che significa.
 */
export function joinCsv(values: string[] | undefined): string | null {
    const puliti = (values ?? []).map((v) => v.trim()).filter((v) => v !== '');

    return puliti.length === 0 ? null : puliti.join(',');
}
