import { useMemo, useState } from 'react';
import {
    Alert,
    Button,
    DatePicker,
    Empty,
    Input,
    Segmented,
    Select,
    Space,
    Table,
    Typography,
} from 'antd';
import type { Dayjs } from 'dayjs';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@admin/api/client';
import { messageOf } from '@admin/api/errors';
import { useStats } from '@admin/api/stats';
import type { Elenco, SubmissionRow, SubmissionType } from '@admin/api/types';
import { TagStato } from '@admin/components/TagStato';
import { PageHeader } from '@admin/layout/PageHeader';
import { ReviewDrawer } from '@admin/pages/ReviewDrawer';

/**
 * Quante proposte sono arrivate, e quante ne resta a schermo dopo i due
 * filtri locali.
 *
 * E' il numero che rende vero il commento su `PER_PAGE`: un cento tondo dice
 * che la coda ha toccato il tetto della risposta e che il filtro va portato
 * sul server.
 */
function conteggio(mostrate: number, arrivate: number): string {
    const proposte = arrivate === 1 ? '1 proposta' : `${arrivate} proposte`;

    return mostrate === arrivate ? proposte : `${mostrate} di ${proposte}`;
}

/** Il tipo con quante ne aspettano, quando le statistiche sono arrivate. */
const etichettaSegmento = (nome: string, quante: number | undefined): string =>
    quante === undefined ? nome : `${nome} (${quante})`;

export const SubmissionsPage = (): React.ReactElement => {
    const [parametri, setParametri] = useSearchParams();
    const [autore, setAutore] = useState<string | undefined>(undefined);
    const [periodo, setPeriodo] = useState<[Dayjs, Dayjs] | null>(null);
    const [inRevisione, setInRevisione] = useState<SubmissionRow | null>(null);
    const [aperto, setAperto] = useState(false);
    const stats = useStats();

    const type = (parametri.get('type') ?? 'exercise') as SubmissionType;
    const status = parametri.get('status') ?? 'pending';
    const q = parametri.get('q') ?? '';

    const scrivi = (chiave: string, valore: string): void => {
        const prossimi = new URLSearchParams(parametri);
        prossimi.set(chiave, valore);
        setParametri(prossimi);
    };

    /*
     * Cambiando tipo, autore e periodo si azzerano.
     *
     * Sono i due filtri che stanno in uno stato locale invece che nella URL, e
     * sopravvivevano al passaggio fra Esercizi e Alimenti: un handle che
     * esisteva solo fra i proponenti di esercizi restava selezionato, il
     * `Select` mostrava l'handle grezzo senza etichetta - perche' non e' piu'
     * fra le opzioni - e la tabella filtrava a zero. Che si legge come "non ci
     * sono proposte di alimenti".
     */
    const cambiaTipo = (valore: SubmissionType): void => {
        setAutore(undefined);
        setPeriodo(null);
        scrivi('type', valore);
    };

    const query = new URLSearchParams({ type, status });
    if (q !== '') query.set('q', q);

    const { data, isPending, error } = useQuery({
        queryKey: ['submissions', query.toString()],
        queryFn: () =>
            apiFetch<Elenco<SubmissionRow>>(`/api/admin/submissions?${query.toString()}`).then(
                (r) => r.data,
            ),
    });

    /*
     * Autore e data si filtrano QUI e non sul server, che non li accetta:
     * `SubmissionController::index` conosce `type`, `status` e `q`, e manda al
     * massimo cento righe ordinate per data (`PER_PAGE`). Su cento righe gia'
     * in mano un filtro lato client e' esatto quanto uno lato server; se un
     * giorno la coda superasse le cento, il filtro va portato di la'.
     *
     * Ed e' visibile che sia il momento, perche' il conteggio e' stampato
     * sopra la tabella e un cento tondo e' il tetto: il commento prometteva
     * quel controllo quando non c'era nulla che stampasse un numero -
     * `pagination={false}` e nessun totale nella risposta - cioe' descriveva
     * una rete che non esisteva.
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

    /*
     * Come sulle pagine di catalogo: un guasto si dice invece di somigliare a
     * una coda vuota - che qui sarebbe peggio, perche' "il catalogo e' in
     * pari" e' un'affermazione, non l'assenza di righe. Il 401 non arriva fin
     * qui, lo prende `app.tsx`.
     */
    if (error !== null) {
        return (
            <>
                <PageHeader titolo="Proposte" />
                <Alert type="error" showIcon title={messageOf(error)} />
            </>
        );
    }

    return (
        <>
            <PageHeader
                titolo="Proposte"
                sottotitolo="Quel che gli utenti si sono creati sul telefono, in attesa di entrare nel catalogo di tutti."
            />

            <Space wrap style={{ marginBottom: 16 }}>
                {/*
                    I due numeri stanno sui due segmenti, e non e' un ornamento:
                    la dashboard somma i due tipi in un riquadro solo ("3
                    proposte in attesa") e il suo link non porta un `type`,
                    quindi si atterra su Esercizi. Con zero esercizi e tre
                    alimenti in coda, la dashboard diceva tre e qui non si
                    vedeva niente. Ora la coda dice dove sta il lavoro, con lo
                    stesso `['stats']` che la dashboard ha gia' letto: un
                    contatore che non venisse da la' potrebbe divergere da
                    quello, che e' il difetto che si sta chiudendo.
                */}
                <Segmented
                    value={type}
                    options={[
                        {
                            value: 'exercise',
                            label: etichettaSegmento('Esercizi', stats.data?.pending.exercises),
                        },
                        {
                            value: 'food',
                            label: etichettaSegmento('Alimenti', stats.data?.pending.foods),
                        },
                    ]}
                    onChange={(valore) => cambiaTipo(valore === 'food' ? 'food' : 'exercise')}
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

            {data !== undefined && (
                <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
                    {conteggio(righe.length, data.length)}
                </Typography.Text>
            )}

            <Table<SubmissionRow>
                rowKey={(riga) => `${riga.type}-${riga.id}`}
                loading={isPending}
                dataSource={righe}
                pagination={false}
                locale={{
                    emptyText: (
                        /*
                            Il vuoto parla del TIPO che si sta guardando, non
                            della coda intera: questa query e' filtrata su
                            `type`, e "il catalogo e' in pari" era
                            un'affermazione su tutto ricavata da una risposta
                            su meta'. Con tre alimenti in attesa, la coda
                            dichiarava di non avere niente da fare.
                        */
                        <Empty
                            description={
                                status === 'pending'
                                    ? `Niente in attesa fra ${type === 'exercise' ? 'gli esercizi' : 'gli alimenti'}.`
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
                        render: (stato: string) => <TagStato stato={stato} />,
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
