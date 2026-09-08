import { useState } from 'react';
import { App, Alert, Button, Form, Input, Modal, Space, Switch, Table, Tag, Typography } from 'antd';
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

export const UsersPage = (): React.ReactElement => {
    const [inReset, setInReset] = useState<UserRow | null>(null);
    const [form] = Form.useForm<Valori>();
    const client = useQueryClient();
    const { message } = App.useApp();

    const { data, isPending } = useQuery({
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

    const reimposta = async (valori: Valori): Promise<void> => {
        if (inReset === null) {
            return;
        }

        try {
            await apiFetch(`/api/admin/users/${inReset.id}/password`, {
                method: 'POST',
                body: { ...valori },
            });
            message.success(`Password di ${inReset.handle} reimpostata. Ora diglielo.`);
            setInReset(null);
            form.resetFields();
        } catch (error) {
            applicaErroriServer(form, CAMPI, error, message.error);
        }
    };

    return (
        <>
            <PageHeader titolo="Utenti" sottotitolo="Gli iscritti e cosa hanno proposto." />

            <Alert
                type="info"
                showIcon
                style={{ marginBottom: 16 }}
                title="L'interruttore IA e' un cartello, non una serratura."
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
                okText="Reimposta"
                cancelText="Annulla"
                onOk={() => void form.submit()}
                onCancel={() => {
                    setInReset(null);
                    form.resetFields();
                }}
                destroyOnHidden
            >
                <Typography.Paragraph type="secondary">
                    Le sessioni aperte di questa persona cadono: una password si cambia anche perche&apos;
                    si teme che qualcuno la conosca.
                </Typography.Paragraph>
                <Form form={form} layout="vertical" onFinish={reimposta}>
                    <Form.Item
                        name="password"
                        label="Nuova password"
                        rules={[
                            { required: true, message: 'Serve una password.' },
                            { min: 8, message: 'Almeno otto caratteri, come alla registrazione.' },
                            { max: 72 },
                        ]}
                    >
                        <Input.Password autoComplete="new-password" />
                    </Form.Item>
                </Form>
            </Modal>
        </>
    );
};
