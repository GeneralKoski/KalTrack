import { useState } from 'react';
import { App, Button, Space, Table, Tabs, Typography } from 'antd';
import { useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@admin/api/client';
import { messageOf } from '@admin/api/errors';
import { chiaveTassonomia, useTaxonomy } from '@admin/api/taxonomies';
import type { TaxonomyKind, TaxonomyRow } from '@admin/api/types';
import { PageHeader } from '@admin/layout/PageHeader';
import { TaxonomyForm } from '@admin/pages/TaxonomyForm';

const Elenco = ({ kind }: { kind: TaxonomyKind }): React.ReactElement => {
    const { data, isPending } = useTaxonomy(kind);
    const [inModifica, setInModifica] = useState<TaxonomyRow | null>(null);
    const [aperto, setAperto] = useState(false);
    const client = useQueryClient();
    const { message, modal } = App.useApp();

    const elimina = (riga: TaxonomyRow): void => {
        modal.confirm({
            title: `Togliere "${riga.labelIt}"?`,
            content:
                'Il server rifiuta se ci sono ancora esercizi che la nominano, e non si puo\' togliere il corpo libero.',
            okText: 'Elimina',
            okButtonProps: { danger: true },
            cancelText: 'Annulla',
            onOk: async () => {
                try {
                    await apiFetch(`/api/admin/taxonomies/${kind}/${riga.id}`, { method: 'DELETE' });
                    await client.invalidateQueries({ queryKey: chiaveTassonomia(kind) });
                    message.success('Tolta.');
                } catch (error) {
                    message.error(messageOf(error));
                    // Rilanciato: AntD tiene aperta la finestra, e il
                    // messaggio si legge accanto a cio' che lo ha provocato.
                    throw error;
                }
            },
        });
    };

    return (
        <>
            <Space style={{ marginBottom: 16 }}>
                <Button
                    type="primary"
                    onClick={() => {
                        setInModifica(null);
                        setAperto(true);
                    }}
                >
                    Nuova voce
                </Button>
            </Space>
            <Table<TaxonomyRow>
                rowKey="id"
                loading={isPending}
                dataSource={data ?? []}
                pagination={false}
                columns={[
                    { title: 'Identificativo', dataIndex: 'slug' },
                    { title: 'Italiano', dataIndex: 'labelIt' },
                    { title: 'Inglese', dataIndex: 'labelEn' },
                    { title: 'Ordine', dataIndex: 'sort', width: 100 },
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
            <TaxonomyForm
                kind={kind}
                riga={inModifica}
                aperto={aperto}
                onChiudi={() => setAperto(false)}
            />
        </>
    );
};

export const TaxonomiesPage = (): React.ReactElement => (
    <>
        <PageHeader
            titolo="Tassonomie"
            sottotitolo="I gruppi muscolari e gli attrezzi che descrivono il catalogo."
        />
        <Typography.Paragraph type="secondary">
            L&apos;identificativo e&apos; quel che sta scritto in colonna su ogni esercizio, e non si
            cambia mai: rinominare &quot;Femorali&quot; in &quot;Ischiocrurali&quot; cambia
            l&apos;etichetta.
        </Typography.Paragraph>
        <Tabs
            items={[
                { key: 'muscle-groups', label: 'Gruppi muscolari', children: <Elenco kind="muscle-groups" /> },
                { key: 'equipment', label: 'Attrezzatura', children: <Elenco kind="equipment" /> },
            ]}
        />
    </>
);
