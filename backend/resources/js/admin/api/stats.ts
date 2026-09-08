import { useQuery } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';
import { apiFetch } from '@admin/api/client';
import type { Stats } from '@admin/api/types';

export const CHIAVE_STATS = ['stats'] as const;

/**
 * I numeri della dashboard, letti da chiunque li mostri.
 *
 * Sta qui e non dentro `DashboardPage` perche' non e' piu' solo suo: i due
 * segmenti della coda di revisione dicono quante proposte aspettano per tipo,
 * e quel numero deve essere lo STESSO che la dashboard somma nel suo
 * riquadro - due letture indipendenti sono due numeri che possono divergere,
 * ed e' esattamente la contraddizione che si e' andati a chiudere ("tre
 * proposte in attesa" di la', "il catalogo e' in pari" di qua).
 *
 * Chiave condivisa, quindi una voce sola nella cache e un chiamante solo di
 * `/api/admin/stats`: `invalidateQueries({ queryKey: ['stats'] })` dopo una
 * decisione in revisione o una cancellazione aggiorna entrambe le schermate.
 */
export function useStats(): UseQueryResult<Stats> {
    return useQuery({
        queryKey: CHIAVE_STATS,
        queryFn: () => apiFetch<Stats>('/api/admin/stats'),
    });
}
