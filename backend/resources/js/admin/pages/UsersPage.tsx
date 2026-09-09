import { useState } from 'react';
import {
    App,
    Alert,
    Button,
    Form,
    Input,
    Modal,
    Segmented,
    Space,
    Switch,
    Table,
    Tag,
    Typography,
} from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@admin/api/client';
import { messageOf } from '@admin/api/errors';
import { applicaErroriServer } from '@admin/api/formErrors';
import type { UserRow } from '@admin/api/types';
import { PageHeader } from '@admin/layout/PageHeader';

interface Risposta {
    users: UserRow[];
}

interface Valori {
    password: string;
}

const CAMPI: (keyof Valori)[] = ['password'];

/**
 * Le due vie per rimettere a posto una password.
 *
 * `mail` e' la prima e la predefinita: il collegamento arriva all'indirizzo
 * dell'utente e la password nuova non la sa nessun altro. `manuale` la
 * scrive l'amministratore, quindi la sanno in due e va comunicata a voce -
 * resta perche' e' l'unica che funziona quando la mail non e' raggiungibile.
 */
type Via = 'mail' | 'manuale';

export const UsersPage = (): React.ReactElement => {
    const [inReset, setInReset] = useState<UserRow | null>(null);
    const [via, setVia] = useState<Via>('mail');
    const [inCorso, setInCorso] = useState(false);
    const [form] = Form.useForm<Valori>();
    const client = useQueryClient();
    const { message } = App.useApp();

    const { data, isPending, error } = useQuery({
        queryKey: ['users'],
        queryFn: () => apiFetch<Risposta>('/api/admin/users').then((r) => r.users),
    });

    const interruttore = useMutation({
        mutationFn: ({ id, acceso }: { id: number; acceso: boolean }) =>
            apiFetch(`/api/admin/users/${id}`, { method: 'PATCH', body: { aiEnabled: acceso } }),
        onSuccess: async () => {
            await client.invalidateQueries({ queryKey: ['users'] });
        },
        onError: (error: unknown) => {
            message.error(messageOf(error));
        },
    });

    const chiudi = (): void => {
        setInReset(null);
        // La via torna alla predefinita, non a quella scelta l'ultima volta:
        // riaprendo la finestra su un'altra persona il modulo si presenta
        // com'e' pensato, e la scelta piu' sicura resta quella di partenza.
        setVia('mail');
        form.resetFields();
    };

    /** Il collegamento per mail: non tocca la password, la manda a chiedere. */
    const mandaCollegamento = async (): Promise<void> => {
        if (inReset === null) {
            return;
        }

        setInCorso(true);

        try {
            await apiFetch(`/api/admin/users/${inReset.id}/password/link`, { method: 'POST' });
            message.success(`Collegamento mandato a ${inReset.email}.`);
            chiudi();
        } catch (error) {
            message.error(messageOf(error));
        } finally {
            setInCorso(false);
        }
    };

    /** La password scritta a mano: quella di sempre. */
    const reimposta = async (valori: Valori): Promise<void> => {
        if (inReset === null) {
            return;
        }

        setInCorso(true);

        try {
            await apiFetch(`/api/admin/users/${inReset.id}/password`, {
                method: 'POST',
                body: { ...valori },
            });
            message.success(`Password di ${inReset.handle} reimpostata. Ora diglielo.`);
            chiudi();
        } catch (error) {
            applicaErroriServer(form, CAMPI, error, message.error);
        } finally {
            setInCorso(false);
        }
    };

    // Come sulle altre pagine di elenco: un guasto si dice invece di
    // somigliare a un elenco vuoto. Il 401 non arriva fin qui, lo prende
    // `app.tsx`.
    if (error !== null) {
        return (
            <>
                <PageHeader titolo="Utenti" />
                <Alert type="error" showIcon title={messageOf(error)} />
            </>
        );
    }

    return (
        <>
            <PageHeader titolo="Utenti" sottotitolo="Gli iscritti e cosa hanno proposto." />

            <Alert
                type="info"
                showIcon
                style={{ marginBottom: 16 }}
                title="L'interruttore IA è un cartello, non una serratura."
                description="Finche' le chiamate a Gemini partono dal telefono con la chiave nel bundle, spegnerlo nasconde il microfono e nient'altro. Serve a regalare l'AI a chi si vuole; diventa un diritto vero quando le chiamate passeranno da qui."
            />

            <Table<UserRow>
                rowKey="id"
                loading={isPending}
                dataSource={data ?? []}
                pagination={false}
                columns={[
                    {
                        title: 'Handle',
                        dataIndex: 'handle',
                        render: (handle: string, riga) => (
                            <Space>
                                <Typography.Text strong>{handle}</Typography.Text>
                                {riga.isAdmin && <Tag color="blue">admin</Tag>}
                            </Space>
                        ),
                    },
                    { title: 'Nome', dataIndex: 'displayName' },
                    { title: 'Email', dataIndex: 'email' },
                    {
                        title: 'Iscritto il',
                        dataIndex: 'createdAt',
                        width: 130,
                        render: (quando: string | null) =>
                            quando === null ? '-' : new Date(quando).toLocaleDateString('it-IT'),
                    },
                    {
                        title: 'Proposte approvate',
                        key: 'proposte',
                        width: 170,
                        /*
                         * Approvate su fatte, non due colonne: il numero che
                         * dice qualcosa e' il rapporto - quattro proposte e
                         * zero approvate e' un segnale, quattro e quattro un
                         * altro.
                         */
                        render: (_, riga) => `${riga.published} su ${riga.submitted}`,
                    },
                    {
                        title: 'IA',
                        dataIndex: 'aiEnabled',
                        width: 80,
                        render: (acceso: boolean, riga) => (
                            <Switch
                                checked={acceso}
                                loading={interruttore.isPending && interruttore.variables?.id === riga.id}
                                onChange={(prossimo) =>
                                    interruttore.mutate({ id: riga.id, acceso: prossimo })
                                }
                            />
                        ),
                    },
                    {
                        title: '',
                        key: 'azioni',
                        width: 180,
                        render: (_, riga) => (
                            <Button size="small" onClick={() => setInReset(riga)}>
                                Reimposta password
                            </Button>
                        ),
                    },
                ]}
            />

            <Modal
                open={inReset !== null}
                title={inReset === null ? '' : `Password di ${inReset.handle}`}
                okText={via === 'mail' ? 'Manda la mail' : 'Reimposta'}
                cancelText="Annulla"
                /*
                 * L'unica azione del pannello che assegna una credenziale era
                 * anche la sola senza uno stato di attesa - `TaxonomyForm` e i
                 * tre drawer ce l'hanno da sempre. Senza, non si vedeva che
                 * stava lavorando e un secondo clic partiva: due POST contro
                 * un `throttle:10,1` speso per niente, e la seconda password
                 * che vince e' quella che nessuno ha comunicato.
                 */
                confirmLoading={inCorso}
                onOk={() => {
                    if (via === 'mail') {
                        void mandaCollegamento();
                    } else {
                        void form.submit();
                    }
                }}
                onCancel={chiudi}
                destroyOnHidden
            >
                {/*
                 * Due scelte fisse in larghezza piena, non un elenco a
                 * tendina: sono due, e il punto e' vederle entrambe insieme
                 * con la differenza scritta sotto - non si sceglie fra
                 * "mail" e "manuale" per gusto, si sceglie fra "la password
                 * la sa solo lui" e "la sappiamo in due".
                 */}
                <Segmented<Via>
                    block
                    value={via}
                    onChange={setVia}
                    style={{ marginBottom: 16 }}
                    options={[
                        { value: 'mail', label: 'Manda la mail di recupero' },
                        { value: 'manuale', label: 'Cambiala a mano' },
                    ]}
                />

                {via === 'mail' ? (
                    <Typography.Paragraph type="secondary">
                        Un collegamento valido un&apos;ora e una volta sola arriva a{' '}
                        <Typography.Text code>{inReset?.email}</Typography.Text>. La password nuova
                        la scrive lui e non la sa nessun altro: è la via da preferire. Le sessioni
                        aperte cadranno quando la userà.
                    </Typography.Paragraph>
                ) : (
                    <>
                        <Typography.Paragraph type="secondary">
                            La scrivi tu e poi devi comunicargliela, quindi la saprete in due. Da
                            usare quando la mail non è raggiungibile. Le sessioni aperte di questa
                            persona cadono subito: una password si cambia anche perché si teme che
                            qualcuno la conosca.
                        </Typography.Paragraph>
                        <Form form={form} layout="vertical" onFinish={reimposta}>
                            <Form.Item
                                name="password"
                                label="Nuova password"
                                rules={[
                                    { required: true, message: 'Serve una password.' },
                                    {
                                        min: 8,
                                        message: 'Almeno otto caratteri, come alla registrazione.',
                                    },
                                    { max: 72 },
                                ]}
                            >
                                <Input.Password autoComplete="new-password" />
                            </Form.Item>
                        </Form>
                    </>
                )}
            </Modal>
        </>
    );
};
