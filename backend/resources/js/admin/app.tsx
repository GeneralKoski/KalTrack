import { App as AntApp, ConfigProvider } from 'antd';
import itIT from 'antd/locale/it_IT';
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { ApiError } from '@admin/api/errors';
import { AuthProvider, CHIAVE_ME } from '@admin/auth/AuthProvider';
import { router } from '@admin/router';

/**
 * Il client di TanStack Query, con l'unico posto che sa cosa fare di un 401.
 *
 * Un 401 non e' un dato che manca, e' la sessione che non c'e' piu': con
 * `retry: false` diventava un errore che nessuno leggeva - `isPending` andava
 * giu', `data?.data ?? []` cadeva sull'elenco vuoto e la tabella disegnava
 * "Nessun dato". Su Esercizi e Alimenti, cioe' le due pagine il cui mestiere
 * e' mostrare cosa c'e' in catalogo, "la tua sessione e' morta" e "il
 * catalogo e' vuoto" si vedevano identici.
 *
 * Il rimedio sta QUI e non nelle cinque pagine: si riporta la sessione ad
 * anonima e da li' se ne occupa `Protected`, che sa gia' rimandare al login e
 * ricordarsi da dove veniva. Cinque rami copiati sarebbero cinque posti da
 * ricordare al primo elenco nuovo.
 *
 * `MutationCache` ha lo stesso gestore, e non per simmetria: una sessione
 * scade mentre si guarda una pagina tanto quanto mentre si salva, e senza
 * questo un Salva che risponde 401 mostrerebbe il toast "La sessione e'
 * scaduta: rientra." lasciando l'amministratore su un modulo che non potra'
 * mai salvare.
 *
 * E' una funzione e non una costante di modulo perche' i test montano le
 * rotte vere con un client loro: senza, proverebbero un client diverso da
 * quello che gira in produzione, che e' il modo di scrivere un test che passa
 * su codice rotto.
 */
export const creaQueryClient = (): QueryClient => {
    const seLaSessioneEMorta = (error: unknown): void => {
        if (error instanceof ApiError && error.status === 401) {
            // La query `me` non passa mai da qui - `fetchMe` tratta il 401
            // come "non sei entrato" e torna `null` - quindi non c'e' anello.
            client.setQueryData(CHIAVE_ME, null);
        }
    };

    const client = new QueryClient({
        queryCache: new QueryCache({ onError: seLaSessioneEMorta }),
        mutationCache: new MutationCache({ onError: seLaSessioneEMorta }),
        defaultOptions: {
            queries: { retry: false, refetchOnWindowFocus: false },
        },
    });

    return client;
};

const queryClient = creaQueryClient();

/**
 * Il guscio: i provider, e l'ordine conta.
 *
 * `AuthProvider` sta DENTRO `QueryClientProvider` perche' la sessione la legge
 * con una query come tutto il resto, e SOPRA il router perche' la guardia
 * delle rotte la interroga.
 */
export const AdminApp = (): React.ReactElement => (
    <ConfigProvider locale={itIT}>
        <AntApp>
            <QueryClientProvider client={queryClient}>
                <AuthProvider>
                    <RouterProvider router={router} />
                </AuthProvider>
            </QueryClientProvider>
        </AntApp>
    </ConfigProvider>
);
