import { useState } from 'react';
import { App, Button, Input, Select, Space, Table, Tag, Typography } from 'antd';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@admin/api/client';
import { messageOf } from '@admin/api/errors';
import { opzioniTassonomia, useTaxonomy } from '@admin/api/taxonomies';
import type { ExerciseRow, Paginato, TaxonomyRow } from '@admin/api/types';
import { CatalogImage } from '@admin/components/CatalogImage';
import { splitCsv } from '@admin/domain/csv';
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
        // sembrerebbe che il filtro non abbia trovato niente.
        prossimi.delete('page');
        setParametri(prossimi);
    };

    const q = parametri.get('q') ?? '';
    const muscleGroup = parametri.get('muscleGroup') ?? '';
    const equipment = parametri.get('equipment') ?? '';
    const missing = parametri.get('missing') ?? '';
    const page = Number(parametri.get('page') ?? '1');

    const query = new URLSearchParams();
    if (q !== '') query.set('q', q);
    if (muscleGroup !== '') query.set('muscleGroup', muscleGroup);
    if (equipment !== '') query.set('equipment', equipment);
    if (missing !== '') query.set('missing', missing);
    query.set('page', String(page));

    const { data, isPending } = useQuery({
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
                                <Typography.Text type="secondary">c&apos;e&apos;</Typography.Text>
                            ),
                    },
                    {
                        title: 'Stato',
                        dataIndex: 'status',
                        width: 120,
                        render: (stato: string) => (
                            <Tag color={stato === 'published' ? 'green' : 'default'}>{stato}</Tag>
                        ),
                    },
                    {
                        title: '',
                        key: 'azioni',
                        width: 190,
                        render: (_, riga) => (
                            <Space>
                                <Button
                                    size="small"
                                    onClick={() => {
                                        setInModifica(riga);
                                        setAperto(true);
                                    }}
                                >
                                    Correggi
                                </Button>
                                <Button size="small" danger onClick={() => elimina(riga)}>
                                    Elimina
                                </Button>
                            </Space>
                        ),
                    },
                ]}
            />

            <ExerciseForm riga={inModifica} aperto={aperto} onChiudi={() => setAperto(false)} />
        </>
    );
};
