import { useMemo, useState } from 'react';
import { Button, DatePicker, Empty, Input, Segmented, Select, Space, Table, Tag } from 'antd';
import type { Dayjs } from 'dayjs';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@admin/api/client';
import type { Elenco, SubmissionRow, SubmissionType } from '@admin/api/types';
import { PageHeader } from '@admin/layout/PageHeader';
import { ReviewDrawer } from '@admin/pages/ReviewDrawer';

export const SubmissionsPage = (): React.ReactElement => {
    const [parametri, setParametri] = useSearchParams();
    const [autore, setAutore] = useState<string | undefined>(undefined);
    const [periodo, setPeriodo] = useState<[Dayjs, Dayjs] | null>(null);
    const [inRevisione, setInRevisione] = useState<SubmissionRow | null>(null);
    const [aperto, setAperto] = useState(false);

    const type = (parametri.get('type') ?? 'exercise') as SubmissionType;
    const status = parametri.get('status') ?? 'pending';
    const q = parametri.get('q') ?? '';

    const scrivi = (chiave: string, valore: string): void => {
        const prossimi = new URLSearchParams(parametri);
        prossimi.set(chiave, valore);
        setParametri(prossimi);
    };

    const query = new URLSearchParams({ type, status });
    if (q !== '') query.set('q', q);

    const { data, isPending } = useQuery({
        queryKey: ['submissions', query.toString()],
        queryFn: () =>
            apiFetch<Elenco<SubmissionRow>>(`/api/admin/submissions?${query.toString()}`).then(
                (r) => r.data,
            ),
    });

    /*
     * Autore e data si filtrano QUI e non sul server, che non li accetta:
     * `SubmissionController::index` conosce `type`, `status` e `q`, e manda al
     * massimo cento righe ordinate per data. Su cento righe gia' in mano un
     * filtro lato client e' esatto quanto uno lato server; se un giorno la
     * coda superasse le cento, il filtro va portato di la' - e allora si
     * vedrebbe, perche' la tabella direbbe cento.
     */
    const autori = useMemo(() => {
        const visti = new Map<string, string>();

        for (const riga of data ?? []) {
            if (riga.author !== null) {
                visti.set(riga.author.handle, riga.author.displayName);
            }
        }

        return [...visti].map(([value, label]) => ({ value, label }));
    }, [data]);

    const righe = useMemo(
        () =>
            (data ?? []).filter((riga) => {
                if (autore !== undefined && riga.author?.handle !== autore) {
                    return false;
                }

                if (periodo === null || riga.createdAt === null) {
                    return periodo === null;
                }

                const quando = new Date(riga.createdAt).getTime();

                return (
                    quando >= periodo[0].startOf('day').valueOf() &&
                    quando <= periodo[1].endOf('day').valueOf()
                );
            }),
        [data, autore, periodo],
    );

    return (
        <>
            <PageHeader
                titolo="Proposte"
                sottotitolo="Quel che gli utenti si sono creati sul telefono, in attesa di entrare nel catalogo di tutti."
            />

            <Space wrap style={{ marginBottom: 16 }}>
                <Segmented
                    value={type}
                    options={[
                        { value: 'exercise', label: 'Esercizi' },
                        { value: 'food', label: 'Alimenti' },
                    ]}
                    onChange={(valore) => scrivi('type', String(valore))}
                />
                <Select
                    value={status}
                    style={{ width: 160 }}
                    options={[
                        { value: 'pending', label: 'In attesa' },
                        { value: 'published', label: 'Approvate' },
                        { value: 'rejected', label: 'Rifiutate' },
                    ]}
                    onChange={(valore: string) => scrivi('status', valore)}
                />
                <Input.Search
                    placeholder="Cerca per nome"
                    defaultValue={q}
                    allowClear
                    style={{ width: 220 }}
                    onSearch={(valore) => scrivi('q', valore)}
                />
                <Select
                    placeholder="Autore"
                    style={{ width: 180 }}
                    allowClear
                    value={autore}
                    options={autori}
                    onChange={setAutore}
                />
                <DatePicker.RangePicker
                    value={periodo}
                    onChange={(valori) =>
                        setPeriodo(
                            valori === null || valori[0] === null || valori[1] === null
                                ? null
                                : [valori[0], valori[1]],
                        )
                    }
                />
            </Space>

            <Table<SubmissionRow>
                rowKey={(riga) => `${riga.type}-${riga.id}`}
                loading={isPending}
                dataSource={righe}
                pagination={false}
                locale={{
                    emptyText: (
                        <Empty
                            description={
                                status === 'pending'
                                    ? 'Niente in attesa. Il catalogo e\' in pari.'
                                    : 'Nessuna proposta con questi filtri.'
                            }
                        />
                    ),
                }}
                columns={[
                    { title: 'Nome', dataIndex: 'name' },
                    {
                        title: 'Proposta da',
                        key: 'autore',
                        width: 200,
                        render: (_, riga) => riga.author?.displayName ?? '-',
                    },
                    {
                        title: 'Il',
                        dataIndex: 'createdAt',
                        width: 140,
                        render: (quando: string | null) =>
                            quando === null ? '-' : new Date(quando).toLocaleDateString('it-IT'),
                    },
                    {
                        title: 'Stato',
                        dataIndex: 'status',
                        width: 130,
                        render: (stato: string) => (
                            <Tag
                                color={
                                    stato === 'pending'
                                        ? 'gold'
                                        : stato === 'published'
                                          ? 'green'
                                          : 'red'
                                }
                            >
                                {stato}
                            </Tag>
                        ),
                    },
                    {
                        title: '',
                        key: 'azioni',
                        width: 140,
                        render: (_, riga) => (
                            <Button
                                size="small"
                                type="primary"
                                // Approvare e rifiutare valgono solo su una
                                // proposta ancora in attesa: il server
                                // risponde 422 su tutto il resto, e offrire
                                // il bottone lo farebbe scoprire dopo.
                                disabled={riga.status !== 'pending'}
                                onClick={() => {
                                    setInRevisione(riga);
                                    setAperto(true);
                                }}
                            >
                                Revisiona
                            </Button>
                        ),
                    },
                ]}
            />

            <ReviewDrawer
                proposta={inRevisione}
                aperto={aperto}
                onChiudi={() => setAperto(false)}
            />
        </>
    );
};
