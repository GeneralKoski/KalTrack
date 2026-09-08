import { createContext, useCallback, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
         * Tutta la cache, non solo `me`: quel che resta sono elenchi che
         * appartenevano alla sessione appena chiusa, e lasciarli farebbe
         * vedere al prossimo che entra i dati caricati dal precedente per un
         * fotogramma.
         */
        client.clear();
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
