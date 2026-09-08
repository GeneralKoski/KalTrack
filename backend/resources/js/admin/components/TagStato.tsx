import { Tag } from 'antd';

/**
 * Lo stato di una voce, in italiano, con lo stesso colore in tutte le tabelle.
 *
 * Le tre pagine stampavano il valore grezzo del server - `published`,
 * `pending`, `rejected` - che e' l'unico inglese rimasto in un pannello dove
 * ogni testo visibile e' in italiano, e in tre copie del ternario che sceglie
 * il colore.
 *
 * **Le etichette sono invariabili di proposito.** Questo tag serve tre
 * tabelle le cui righe hanno generi diversi - un esercizio, un alimento, una
 * proposta - e un aggettivo ("Pubblicato") sarebbe giusto in due e sbagliato
 * nella terza. Si dice quindi dove la voce si trova, che e' anche
 * l'informazione utile: in catalogo la vedono tutti, in attesa nessuno.
 */
const ETICHETTE: Record<string, { testo: string; colore: string }> = {
    published: { testo: 'In catalogo', colore: 'green' },
    pending: { testo: 'In attesa', colore: 'gold' },
    rejected: { testo: 'Fuori catalogo', colore: 'red' },
};

export const TagStato = ({ stato }: { stato: string }): React.ReactElement => {
    /*
     * Uno stato che non conosciamo si mostra com'e' arrivato invece di
     * sparire: se il server ne aggiungesse un quarto, un trattino direbbe
     * che quella voce non ha stato - e' piu' onesto far leggere la parola
     * inglese e accorgersene.
     */
    const { testo, colore } = ETICHETTE[stato] ?? { testo: stato, colore: 'default' };

    return <Tag color={colore}>{testo}</Tag>;
};
