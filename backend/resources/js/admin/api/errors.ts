/**
 * Un errore che il server ha spiegato.
 *
 * `errors` e' il corpo `errors` di Laravel - campo per campo - e `message` il
 * riassunto in una frase che `App\Support\ValidationMessage` scrive apposta
 * per un toast. Si usano tutti e due: il riassunto sopra, i dettagli sotto il
 * campo giusto.
 */
export class ApiError extends Error {
    readonly status: number;

    readonly errors: Record<string, string[]>;

    constructor(status: number, message: string, errors: Record<string, string[]> = {}) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.errors = errors;
    }
}

export interface FieldError {
    name: string;
    errors: string[];
}

/** Il corpo `errors` nella forma che `Form.setFields` di AntD si aspetta. */
export function toFormFields(errors: Record<string, string[]>): FieldError[] {
    return Object.entries(errors).map(([name, messages]) => ({ name, errors: messages }));
}

/** Il testo da mettere in un toast, qualunque cosa sia arrivata. */
export function messageOf(error: unknown): string {
    if (error instanceof Error && error.message !== '') {
        return error.message;
    }

    return 'Errore imprevisto.';
}
