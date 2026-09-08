import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Form, Input } from 'antd';
import { applicaErroriServer } from '@admin/api/formErrors';
import { ApiError } from '@admin/api/errors';

interface Valori {
    login: string;
    password: string;
}

const CAMPI: (keyof Valori)[] = ['login', 'password'];

/**
 * Un modulo minimo con due campi, per verificare che gli errori atterrino
 * davvero sotto quello giusto - non basta controllare l'array che
 * `applicaErroriServer` costruisce, perche' la promessa e' su cosa AntD
 * disegna.
 */
function Cavia({ error, avvisa }: { error: unknown; avvisa: (messaggio: string) => void }): React.ReactElement {
    const [form] = Form.useForm<Valori>();

    return (
        <Form form={form}>
            <Form.Item name="login" label="Login">
                <Input />
            </Form.Item>
            <Form.Item name="password" label="Password">
                <Input />
            </Form.Item>
            <button onClick={() => applicaErroriServer(form, CAMPI, error, avvisa)}>Applica</button>
        </Form>
    );
}

const erroriVisibili = (): string[] =>
    Array.from(document.querySelectorAll('.ant-form-item-explain-error')).map((nodo) => nodo.textContent ?? '');

describe('applicaErroriServer', () => {
    it('mette il messaggio del server sotto il campo giusto', async () => {
        const avvisa = vi.fn();
        const error = new ApiError(422, 'Correggi i campi evidenziati.', {
            login: ['Login non valido.'],
        });
        render(<Cavia error={error} avvisa={avvisa} />);

        await userEvent.click(screen.getByRole('button', { name: 'Applica' }));

        expect(erroriVisibili()).toEqual(['Login non valido.']);
        expect(avvisa).toHaveBeenCalledWith('Correggi i campi evidenziati.');
    });

    it('scarta un campo che il modulo non dichiara, invece di andare in crash', async () => {
        const avvisa = vi.fn();
        // Il server nomina anche "extra", che non e' fra i due campi che
        // `Cavia` passa a `applicaErroriServer`: deve sparire senza rompere
        // gli altri.
        const error = new ApiError(422, 'Correggi i campi evidenziati.', {
            login: ['Login non valido.'],
            extra: ['Un campo che il modulo non ha.'],
        });
        render(<Cavia error={error} avvisa={avvisa} />);

        await userEvent.click(screen.getByRole('button', { name: 'Applica' }));

        expect(erroriVisibili()).toEqual(['Login non valido.']);
    });

    it('avvisa con il riassunto anche quando il server non manda dettagli per campo', async () => {
        const avvisa = vi.fn();
        const error = new ApiError(500, 'Errore del server.', {});
        render(<Cavia error={error} avvisa={avvisa} />);

        await userEvent.click(screen.getByRole('button', { name: 'Applica' }));

        expect(erroriVisibili()).toEqual([]);
        expect(avvisa).toHaveBeenCalledWith('Errore del server.');
    });

    it('un errore che non e\' un ApiError arriva comunque al notificatore, con un messaggio sensato', async () => {
        const avvisa = vi.fn();
        // Non un'istanza di `Error`: `messageOf` non ha un `.message` a cui
        // appoggiarsi e deve rispondere col suo messaggio di riserva.
        render(<Cavia error="qualcosa e' andato storto" avvisa={avvisa} />);

        await userEvent.click(screen.getByRole('button', { name: 'Applica' }));

        expect(erroriVisibili()).toEqual([]);
        expect(avvisa).toHaveBeenCalledWith('Errore imprevisto.');
    });
});
