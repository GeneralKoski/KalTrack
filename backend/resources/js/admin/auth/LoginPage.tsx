import { useState } from 'react';
import { App, Button, Card, Form, Input, Typography } from 'antd';
import { Navigate, useLocation } from 'react-router-dom';
import { applicaErroriServer } from '@admin/api/formErrors';
import { login } from '@admin/auth/session';
import { useAuth } from '@admin/auth/AuthProvider';

interface Credenziali {
    login: string;
    password: string;
}

const CAMPI: (keyof Credenziali)[] = ['login', 'password'];

/**
 * Dove tornare dopo essere entrati: il percorso che `Protected` ha messo da
 * parte quando ha rimandato qui, o la dashboard.
 *
 * Quello stato veniva scritto e mai letto - `Protected` lo mette in
 * `state={{ da: pathname }}` da sempre e nessuno lo guardava - quindi chi
 * arrivava su una pagina interna con la sessione scaduta, dopo aver rifatto
 * l'accesso, si ritrovava sulla dashboard invece che dove stava andando.
 *
 * `useLocation().state` e' `unknown` e non si restringe con un cast: si
 * guarda com'e' fatto, come `ReviewDrawer` fa con `fields`. Solo un percorso
 * assoluto, e non `/login`: uno stato scritto male non deve poter mandare
 * altrove ne' far girare in tondo.
 */
function percorsoDiRitorno(stato: unknown): string {
    if (typeof stato === 'object' && stato !== null && 'da' in stato) {
        const da = stato.da;

        if (typeof da === 'string' && da.startsWith('/') && da !== '/login') {
            return da;
        }
    }

    return '/';
}

/**
 * L'unica pagina che esiste per chi non e' entrato.
 *
 * Non c'e' una registrazione e non c'e' un recupero password: gli account li
 * fa l'app, e la password la rimette un amministratore da Utenti. Dirlo qui
 * evita la domanda.
 */
export const LoginPage = (): React.ReactElement => {
    const [form] = Form.useForm<Credenziali>();
    const [inCorso, setInCorso] = useState(false);
    const { stato, rileggi } = useAuth();
    const { state } = useLocation();
    const { message } = App.useApp();

    /*
     * Chi e' dentro non ha niente da fare qui, e questo ramo e' l'unica via
     * d'ingresso al pannello: `entra` fa il POST e rilegge la sessione, ma
     * fermandosi li' le credenziali venivano accettate, il cookie scritto,
     * `stato` passava a `dentro` - e l'amministratore restava a guardare il
     * modulo compilato. L'unico modo di entrare era scrivere `/admin` nella
     * barra degli indirizzi.
     *
     * `replace` e non un `navigate` normale: il login non deve restare nella
     * cronologia dietro la dashboard, o l'indietro del browser ci
     * riporterebbe sopra.
     */
    if (stato === 'dentro') {
        return <Navigate to={percorsoDiRitorno(state)} replace />;
    }

    const entra = async (valori: Credenziali): Promise<void> => {
        setInCorso(true);

        try {
            await login(valori);
            await rileggi();
        } catch (error) {
            applicaErroriServer(form, CAMPI, error, message.error);
        } finally {
            setInCorso(false);
        }
    };

    return (
        <div
            style={{
                minHeight: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 24,
            }}
        >
            <Card style={{ width: 380 }}>
                <Typography.Title level={4}>Gestionale KalTrack</Typography.Title>
                <Typography.Paragraph type="secondary">
                    L&apos;accesso e&apos; riservato agli amministratori.
                </Typography.Paragraph>
                <Form form={form} layout="vertical" onFinish={entra} requiredMark={false}>
                    <Form.Item
                        name="login"
                        label="Handle o email"
                        rules={[{ required: true, message: 'Serve un handle o un\'email.' }]}
                    >
                        <Input autoComplete="username" autoFocus />
                    </Form.Item>
                    <Form.Item
                        name="password"
                        label="Password"
                        rules={[{ required: true, message: 'Serve la password.' }]}
                    >
                        <Input.Password autoComplete="current-password" />
                    </Form.Item>
                    <Button type="primary" htmlType="submit" block loading={inCorso}>
                        Entra
                    </Button>
                </Form>
            </Card>
        </div>
    );
};
