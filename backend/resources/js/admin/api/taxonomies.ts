import { useQuery } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';
import { apiFetch } from '@admin/api/client';
import type { Elenco, TaxonomyKind, TaxonomyRow } from '@admin/api/types';

export const chiaveTassonomia = (kind: TaxonomyKind): [string, TaxonomyKind] => ['taxonomies', kind];

export function useTaxonomy(kind: TaxonomyKind): UseQueryResult<TaxonomyRow[]> {
    return useQuery({
        queryKey: chiaveTassonomia(kind),
        queryFn: () =>
            apiFetch<Elenco<TaxonomyRow>>(`/api/admin/taxonomies/${kind}`).then((r) => r.data),
        /*
         * Cinque minuti: sono dodici gruppi e undici attrezzi che cambiano
         * una volta all'anno, e ogni tendina della pagina Esercizi li chiede.
         * Rileggerli a ogni montaggio sarebbe una richiesta per apertura di
         * form.
         */
        staleTime: 5 * 60 * 1000,
    });
}

/** Le opzioni per un `Select`: valore lo slug, etichetta quella italiana. */
export function opzioniTassonomia(
    righe: TaxonomyRow[] | undefined,
): { value: string; label: string }[] {
    return (righe ?? []).map((r) => ({ value: r.slug, label: r.labelIt }));
}
