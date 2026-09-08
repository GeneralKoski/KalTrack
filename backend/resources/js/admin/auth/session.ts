import { apiFetch } from '@admin/api/client';
import { ApiError } from '@admin/api/errors';
import type { AdminMe } from '@admin/api/types';

/**
 * Chi e' entrato, o `null`.
 *
 * `GET /api/me` e non una rotta nuova: e' gia' sotto `auth:sanctum`, e da
 * quando `statefulApi()` vale sulle rotte `/api/*` il cookie di sessione le
 * apre come farebbe un token. Torna `null` invece di lanciare perche' "non
 * sei entrato" non e' un guasto: e' la meta' dei casi al primo caricamento.
 *
 * Un utente valido ma non amministratore vale `null` come un anonimo.
 * `AdminAuthController::login` gia' rifiuta chi non ha `is_admin`, quindi non
 * dovrebbe capitare; se capitasse - un account degradato a sessione aperta -
 * mostrargli il pannello vorrebbe dire mostrargli sei pagine che rispondono
 * 403 una per una.
 */
export async function fetchMe(): Promise<AdminMe | null> {
    try {
        const me = await apiFetch<AdminMe>('/api/me');

        return me.isAdmin ? me : null;
    } catch (error) {
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
            return null;
        }

        throw error;
    }
}

export async function login(credenziali: { login: string; password: string }): Promise<void> {
    await apiFetch('/admin/login', { method: 'POST', body: credenziali });
}

export async function logout(): Promise<void> {
    await apiFetch('/admin/logout', { method: 'POST', body: {} });
}
