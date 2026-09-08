import { useState } from 'react';
import { App, Button, Card, Form, Input, Typography } from 'antd';
import { applicaErroriServer } from '@admin/api/formErrors';
import { login } from '@admin/auth/session';
import { useAuth } from '@admin/auth/AuthProvider';

interface Credenziali {
    login: string;
    password: string;
}

const CAMPI: (keyof Credenziali)[] = ['login', 'password'];

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
    const { rileggi } = useAuth();
    const { message } = App.useApp();

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
