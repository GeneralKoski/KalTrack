import { useState } from 'react';
import { DeleteOutlined, EditOutlined } from '@ant-design/icons';
import { Alert, App, Button, Input, Select, Space, Table, Tag, Tooltip, Typography } from 'antd';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@admin/api/client';
import { messageOf } from '@admin/api/errors';
import { opzioniTassonomia, useTaxonomy } from '@admin/api/taxonomies';
import type { ExerciseRow, Paginato, TaxonomyRow } from '@admin/api/types';
import { CatalogImage } from '@admin/components/CatalogImage';
import { TagStato } from '@admin/components/TagStato';
import { splitCsv } from '@admin/domain/csv';
import { numeroPagina } from '@admin/domain/pagina';
import { PageHeader } from '@admin/layout/PageHeader';
import { ExerciseForm } from '@admin/pages/ExerciseForm';

/** Quante ne manda una pagina: `AdminExerciseController::PER_PAGE`. */
const PER_PAGINA = 50;

const etichetta = (righe: TaxonomyRow[] | undefined, slug: string): string =>
    righe?.find((r) => r.slug === slug)?.labelIt ?? slug;

export const ExercisesPage = (): React.ReactElement => {
    /*
     * I filtri stanno nella URL e non in uno stato locale: e' cosi' che il
     * link della dashboard ("Vedi quali", con `?missing=instructions`) apre
     * la pagina gia' filtrata, e che un filtro impostato sopravvive a un
     * ricaricamento.
     */
    const [parametri, setParametri] = useSearchParams();
    const [inModifica, setInModifica] = useState<ExerciseRow | null>(null);
    const [aperto, setAperto] = useState(false);
    const gruppi = useTaxonomy('muscle-groups');
    const attrezzi = useTaxonomy('equipment');
    const client = useQueryClient();
    const { message, modal } = App.useApp();

    const scrivi = (chiave: string, valore: string | null): void => {
        const prossimi = new URLSearchParams(parametri);

        if (valore === null || valore === '') {
            prossimi.delete(chiave);
        } else {
            prossimi.set(chiave, valore);
        }

        // Cambiare un filtro riporta a pagina uno: restare alla nona pagina
        // di un elenco che ora ne ha due mostrerebbe una tabella vuota e
        // sembrerebbe che il filtro non abbia trovato niente. `page` e'
        // l'eccezione: e' la chiave con cui la tabella scrive la pagina
        // stessa, e cancellarla anche in quel caso disfaceva il valore
        // appena scritto due righe sopra - un clic su "pagina 2" restava
        // sempre alla prima.
        if (chiave !== 'page') {
            prossimi.delete('page');
        }
        setParametri(prossimi);
    };

    const q = parametri.get('q') ?? '';
    const muscleGroup = parametri.get('muscleGroup') ?? '';
    const equipment = parametri.get('equipment') ?? '';
    const missing = parametri.get('missing') ?? '';
    const page = numeroPagina(parametri.get('page'));

    const query = new URLSearchParams();
    if (q !== '') query.set('q', q);
    if (muscleGroup !== '') query.set('muscleGroup', muscleGroup);
    if (equipment !== '') query.set('equipment', equipment);
    if (missing !== '') query.set('missing', missing);
    query.set('page', String(page));

    const { data, isPending, error } = useQuery({
        queryKey: ['exercises', query.toString()],
        queryFn: () => apiFetch<Paginato<ExerciseRow>>(`/api/admin/exercises?${query.toString()}`),
    });

    const elimina = (riga: ExerciseRow): void => {
        modal.confirm({
            title: `Togliere "${riga.name}" dal catalogo?`,
            content:
                'La riga resta sul server marcata cancellata, ed e\' cosi\' che i telefoni vengono a sapere che non c\'e\' piu\'. Ricrearla con lo stesso nome la fa tornare com\'era.',
            okText: 'Elimina',
            okButtonProps: { danger: true },
            cancelText: 'Annulla',
            onOk: async () => {
                try {
                    await apiFetch(`/api/admin/exercises/${riga.id}`, { method: 'DELETE' });
                    await client.invalidateQueries({ queryKey: ['exercises'] });
                    await client.invalidateQueries({ queryKey: ['stats'] });
                    message.success('Tolto dal catalogo.');
                } catch (error) {
                    message.error(messageOf(error));
                    throw error;
                }
            },
        });
    };

    /*
     * Un guasto si dice, non si disegna come un catalogo vuoto: senza questo
     * ramo un 500 o una rete caduta finivano in `data?.data ?? []`, cioe' in
     * "Nessun dato" - la stessa schermata che si vede quando il catalogo e'
     * davvero vuoto. Il 401 non arriva fin qui: lo intercetta il gestore
     * della cache in `app.tsx` e rimanda al login.
     */
    if (error !== null) {
        return (
            <>
                <PageHeader titolo="Esercizi" />
                <Alert type="error" showIcon title={messageOf(error)} />
            </>
        );
    }

    return (
        <>
            <PageHeader
                titolo="Esercizi"
                sottotitolo="Il catalogo comune: quel che sta qui arriva su ogni telefono."
                azione={
                    <Button
                        type="primary"
                        onClick={() => {
                            setInModifica(null);
                            setAperto(true);
                        }}
                    >
                        Nuovo esercizio
                    </Button>
                }
            />

            <Space wrap style={{ marginBottom: 16 }}>
                <Input.Search
                    placeholder="Cerca per nome"
                    defaultValue={q}
                    allowClear
                    style={{ width: 240 }}
                    onSearch={(valore) => scrivi('q', valore)}
                />
                <Select
                    placeholder="Gruppo muscolare"
                    style={{ width: 200 }}
                    allowClear
                    value={muscleGroup === '' ? undefined : muscleGroup}
                    options={opzioniTassonomia(gruppi.data)}
                    onChange={(valore: string | undefined) => scrivi('muscleGroup', valore ?? null)}
                />
                <Select
                    placeholder="Attrezzatura"
                    style={{ width: 200 }}
                    allowClear
                    value={equipment === '' ? undefined : equipment}
                    options={opzioniTassonomia(attrezzi.data)}
                    onChange={(valore: string | undefined) => scrivi('equipment', valore ?? null)}
                />
                <Select
                    placeholder="Cosa manca"
                    style={{ width: 200 }}
                    allowClear
                    value={missing === '' ? undefined : missing}
                    options={[
                        { value: 'instructions', label: 'Senza descrizione' },
                        { value: 'photo', label: 'Senza foto' },
                    ]}
                    onChange={(valore: string | undefined) => scrivi('missing', valore ?? null)}
                />
            </Space>

            <Table<ExerciseRow>
                rowKey="id"
                loading={isPending}
                dataSource={data?.data ?? []}
                pagination={{
                    current: page,
                    pageSize: PER_PAGINA,
                    total: data?.meta.total ?? 0,
                    showSizeChanger: false,
                    onChange: (prossima) => scrivi('page', String(prossima)),
                }}
                columns={[
                    {
                        title: '',
                        dataIndex: 'photo',
                        width: 64,
                        render: (photo: string | null) => <CatalogImage nome={photo} />,
                    },
                    { title: 'Nome', dataIndex: 'name' },
                    {
                        title: 'Gruppo',
                        dataIndex: 'muscleGroup',
                        render: (slug: string) => etichetta(gruppi.data, slug),
                    },
                    {
                        title: 'Attrezzatura',
                        dataIndex: 'equipment',
                        render: (valore: string | null) => (
                            <Space wrap size={[4, 4]}>
                                {splitCsv(valore).map((slug) => (
                                    <Tag key={slug}>{etichetta(attrezzi.data, slug)}</Tag>
                                ))}
                            </Space>
                        ),
                    },
                    {
                        title: 'Descrizione',
                        dataIndex: 'instructions',
                        width: 120,
                        render: (testo: string | null) =>
                            testo === null || testo === '' ? (
                                <Typography.Text type="danger">manca</Typography.Text>
                            ) : (
                                <Typography.Text type="secondary">c&apos;è</Typography.Text>
                            ),
                    },
                    {
                        title: 'Stato',
                        dataIndex: 'status',
                        width: 120,
                        render: (stato: string) => <TagStato stato={stato} />,
                    },
                    {
                        title: '',
                        key: 'azioni',
                        width: 100,
                        render: (_, riga) => (
                            <Space>
                                <Tooltip title="Modifica">
                                    <Button
                                        size="small"
                                        icon={<EditOutlined />}
                                        aria-label="Modifica"
                                        onClick={() => {
                                            setInModifica(riga);
                                            setAperto(true);
                                        }}
                                    />
                                </Tooltip>
                                <Tooltip title="Elimina">
                                    <Button
                                        size="small"
                                        danger
                                        icon={<DeleteOutlined />}
                                        aria-label="Elimina"
                                        onClick={() => elimina(riga)}
                                    />
                                </Tooltip>
                            </Space>
                        ),
                    },
                ]}
            />

            <ExerciseForm riga={inModifica} aperto={aperto} onChiudi={() => setAperto(false)} />
        </>
    );
};
