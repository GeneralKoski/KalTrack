import { apiFetch } from '@admin/api/client';

/**
 * Manda la foto di una voce di catalogo, dopo che la voce esiste.
 *
 * L'unica richiesta del pannello che non manda JSON, e passa comunque da
 * `apiFetch`: un `fetch` nudo non porta il cookie di sessione né il token
 * CSRF e tornerebbe 419.
 *
 * Sta qui e non nel componente della foto perché ora la mandano i moduli, al
 * salvataggio, e sono due (`ExerciseForm`, `FoodForm`): scritta due volte
 * divergerebbe alla prima correzione fatta in una sola.
 */
export async function caricaFoto(endpoint: string, file: File): Promise<void> {
    const corpo = new FormData();
    corpo.append('file', file);

    await apiFetch(endpoint, { method: 'POST', body: corpo });
}
