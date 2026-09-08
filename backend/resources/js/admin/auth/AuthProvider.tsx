import { createContext, useCallback, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import { hashKey, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchMe, logout } from '@admin/auth/session';
import type { AdminMe } from '@admin/api/types';

type Stato = 'attesa' | 'anonimo' | 'dentro';

interface Sessione {
    stato: Stato;
    me: AdminMe | null;
    rileggi: () => Promise<void>;
    esci: () => Promise<void>;
}

const Contesto = createContext<Sessione | null>(null);

export const CHIAVE_ME = ['me'] as const;

export const AuthProvider = ({ children }: { children: ReactNode }): React.ReactElement => {
    const client = useQueryClient();
    const { data, isPending } = useQuery({ queryKey: CHIAVE_ME, queryFn: fetchMe });

    const rileggi = useCallback(async () => {
        await client.invalidateQueries({ queryKey: CHIAVE_ME });
    }, [client]);

    const esci = useCallback(async () => {
        await logout();

        /*
         * Prima si riscrive `me` a `null`, poi si toglie tutto il resto.
         *
         * `client.clear()` da solo non bastava, ed e' il difetto piu' subdolo
         * di questo file: toglie le query dalla cache ma non avvisa un
         * observer sottoscritto - un `QueryObserver` si sottoscrive alla sua
         * query, non alla cache - quindi lo `useQuery` qui sopra continuava a
         * riportare i dati di prima, `stato` restava `dentro` e a schermo non
         * cambiava niente. Il cookie era distrutto sul server e il pannello
         * mostrava ancora il nome dell'amministratore in testa: su una
         * macchina condivisa "sono uscito" era falso nell'unico senso che
         * conta.
         *
         * Riscrivere il dato invece di rimuovere la query e' proprio cio' che
         * l'observer sente. `me` percio' si SOVRASCRIVE e non si rimuove; il
         * resto si rimuove com'era, perche' sono elenchi della sessione
         * appena chiusa e lasciarli li' li farebbe vedere per un fotogramma
         * al prossimo che entra.
         */
        client.setQueryData(CHIAVE_ME, null);
        client.removeQueries({ predicate: (query) => query.queryHash !== hashKey(CHIAVE_ME) });
    }, [client]);

    const valore = useMemo<Sessione>(() => {
        const me = data ?? null;

        return {
            stato: isPending ? 'attesa' : me === null ? 'anonimo' : 'dentro',
            me,
            rileggi,
            esci,
        };
    }, [data, isPending, rileggi, esci]);

    return <Contesto.Provider value={valore}>{children}</Contesto.Provider>;
};

export const useAuth = (): Sessione => {
    const valore = useContext(Contesto);

    if (valore === null) {
        throw new Error('useAuth fuori da AuthProvider.');
    }

    return valore;
};
