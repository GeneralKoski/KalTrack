import { useState } from 'react';
import { DeleteOutlined, EditOutlined } from '@ant-design/icons';
import { Alert, App, Button, Input, Space, Table, Tag, Tooltip, Typography } from 'antd';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@admin/api/client';
import { messageOf } from '@admin/api/errors';
import type { FoodRow, Paginato } from '@admin/api/types';
import { CatalogImage } from '@admin/components/CatalogImage';
import { TagStato } from '@admin/components/TagStato';
import { numeroPagina } from '@admin/domain/pagina';
import { PageHeader } from '@admin/layout/PageHeader';
import { FoodForm } from '@admin/pages/FoodForm';

/** Quanti ne manda una pagina: `AdminFoodController::PER_PAGE`. */
const PER_PAGINA = 50;

export const FoodsPage = (): React.ReactElement => {
    const [parametri, setParametri] = useSearchParams();
    const [inModifica, setInModifica] = useState<FoodRow | null>(null);
    const [aperto, setAperto] = useState(false);
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
    const barcode = parametri.get('barcode') ?? '';
    const page = numeroPagina(parametri.get('page'));

    const query = new URLSearchParams();
    if (q !== '') query.set('q', q);
    if (barcode !== '') query.set('barcode', barcode);
    query.set('page', String(page));

    const { data, isPending, error } = useQuery({
        queryKey: ['foods', query.toString()],
        queryFn: () => apiFetch<Paginato<FoodRow>>(`/api/admin/foods?${query.toString()}`),
    });

    const elimina = (riga: FoodRow): void => {
        modal.confirm({
            title: `Togliere "${riga.name}" dal catalogo?`,
            content:
                'La riga resta sul server marcata cancellata, ed e\' cosi\' che i telefoni vengono a sapere che non c\'e\' piu\'.',
            okText: 'Elimina',
            okButtonProps: { danger: true },
            cancelText: 'Annulla',
            onOk: async () => {
                try {
                    await apiFetch(`/api/admin/foods/${riga.id}`, { method: 'DELETE' });
                    await client.invalidateQueries({ queryKey: ['foods'] });
                    await client.invalidateQueries({ queryKey: ['stats'] });
                    message.success('Tolto dal catalogo.');
                } catch (error) {
                    message.error(messageOf(error));
                    throw error;
                }
            },
        });
    };

    // Come su Esercizi: un guasto si dice invece di somigliare a un catalogo
    // vuoto. Il 401 non arriva fin qui, lo prende `app.tsx`.
    if (error !== null) {
        return (
            <>
                <PageHeader titolo="Alimenti" />
                <Alert type="error" showIcon title={messageOf(error)} />
            </>
        );
    }

    return (
        <>
            <PageHeader
                titolo="Alimenti"
                sottotitolo="Il catalogo comune degli alimenti."
                azione={
                    <Button
                        type="primary"
                        onClick={() => {
                            setInModifica(null);
                            setAperto(true);
                        }}
                    >
                        Nuovo alimento
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
                <Input.Search
                    placeholder="Codice a barre esatto"
                    defaultValue={barcode}
                    allowClear
                    style={{ width: 220 }}
                    onSearch={(valore) => scrivi('barcode', valore)}
                />
            </Space>

            <Table<FoodRow>
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
                        dataIndex: 'image',
                        width: 64,
                        render: (image: string | null) => <CatalogImage nome={image} />,
                    },
                    { title: 'Nome', dataIndex: 'name' },
                    {
                        title: 'Marca',
                        dataIndex: 'brand',
                        render: (marca: string | null) =>
                            marca ?? <Typography.Text type="secondary">-</Typography.Text>,
                    },
                    { title: 'kcal', dataIndex: 'kcal', width: 90 },
                    {
                        title: 'Provenienza',
                        dataIndex: 'offId',
                        width: 150,
                        /*
                         * Da dove vengono i valori, che e' l'unica cosa che
                         * dice quanto fidarsene: OpenFoodFacts lo compila
                         * chiunque.
                         */
                        render: (offId: string | null) =>
                            offId === null ? (
                                <Typography.Text type="secondary">a mano</Typography.Text>
                            ) : (
                                <Tag>OpenFoodFacts</Tag>
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

            <FoodForm riga={inModifica} aperto={aperto} onChiudi={() => setAperto(false)} />
        </>
    );
};
