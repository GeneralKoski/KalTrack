import { useEffect, useState } from 'react';
import { App, Button, Drawer, Flex, Form, Input, Select, Space } from 'antd';
import { useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@admin/api/client';
import { applicaErroriServer } from '@admin/api/formErrors';
import { opzioniTassonomia, useTaxonomy } from '@admin/api/taxonomies';
import type { ExerciseRow } from '@admin/api/types';
import { CatalogImage } from '@admin/components/CatalogImage';
import { PhotoUpload } from '@admin/components/PhotoUpload';
import { joinCsv, splitCsv } from '@admin/domain/csv';

interface Props {
    riga: ExerciseRow | null;
    aperto: boolean;
    onChiudi: () => void;
}

interface Valori {
    name: string;
    muscleGroup: string;
    secondaryMuscles: string[];
    equipment: string[];
    instructions: string;
}

const CAMPI: (keyof Valori)[] = ['name', 'muscleGroup', 'secondaryMuscles', 'equipment', 'instructions'];

export const ExerciseForm = ({ riga, aperto, onChiudi }: Props): React.ReactElement => {
    const [form] = Form.useForm<Valori>();
    const [inCorso, setInCorso] = useState(false);
    const [foto, setFoto] = useState<string | null>(null);
    const gruppi = useTaxonomy('muscle-groups');
    const attrezzi = useTaxonomy('equipment');
    const client = useQueryClient();
    const { message } = App.useApp();

    useEffect(() => {
        if (!aperto) {
            return;
        }

        setFoto(riga?.photo ?? null);

        if (riga === null) {
            form.resetFields();

            return;
        }

        form.setFieldsValue({
            name: riga.name,
            muscleGroup: riga.muscleGroup,
            secondaryMuscles: splitCsv(riga.secondaryMuscles),
            equipment: splitCsv(riga.equipment),
            instructions: riga.instructions ?? '',
        });
    }, [aperto, riga, form]);

    const salva = async (valori: Valori): Promise<void> => {
        const corpo = {
            name: valori.name,
            muscleGroup: valori.muscleGroup,
            secondaryMuscles: joinCsv(valori.secondaryMuscles),
            equipment: joinCsv(valori.equipment),
            instructions: valori.instructions === '' ? null : valori.instructions,
        };

        setInCorso(true);

        try {
            if (riga === null) {
                await apiFetch('/api/admin/exercises', { method: 'POST', body: corpo });
            } else {
                await apiFetch(`/api/admin/exercises/${riga.id}`, { method: 'PATCH', body: corpo });
            }

            await client.invalidateQueries({ queryKey: ['exercises'] });
            await client.invalidateQueries({ queryKey: ['stats'] });
            message.success('Salvato.');
            onChiudi();
        } catch (error) {
            applicaErroriServer(form, CAMPI, error, message.error);
        } finally {
            setInCorso(false);
        }
    };

    return (
        <Drawer
            open={aperto}
            width={560}
            title={riga === null ? 'Nuovo esercizio' : riga.name}
            onClose={onChiudi}
            destroyOnHidden
            extra={
                <Space>
                    <Button onClick={onChiudi}>Annulla</Button>
                    <Button type="primary" loading={inCorso} onClick={() => void form.submit()}>
                        Salva
                    </Button>
                </Space>
            }
        >
            <Form form={form} layout="vertical" onFinish={salva} requiredMark={false}>
                <Form.Item
                    name="name"
                    label="Nome"
                    rules={[{ required: true, message: 'Serve un nome.' }, { max: 120 }]}
                >
                    <Input />
                </Form.Item>
                <Form.Item
                    name="muscleGroup"
                    label="Gruppo muscolare"
                    rules={[{ required: true, message: 'Serve un gruppo muscolare.' }]}
                >
                    <Select
                        options={opzioniTassonomia(gruppi.data)}
                        loading={gruppi.isPending}
                        showSearch
                        optionFilterProp="label"
                    />
                </Form.Item>
                <Form.Item name="secondaryMuscles" label="Muscoli secondari">
                    <Select
                        mode="multiple"
                        options={opzioniTassonomia(gruppi.data)}
                        loading={gruppi.isPending}
                        optionFilterProp="label"
                        allowClear
                    />
                </Form.Item>
                <Form.Item name="equipment" label="Attrezzatura">
                    <Select
                        mode="multiple"
                        options={opzioniTassonomia(attrezzi.data)}
                        loading={attrezzi.isPending}
                        optionFilterProp="label"
                        allowClear
                    />
                </Form.Item>
                <Form.Item
                    name="instructions"
                    label="Come si esegue"
                    extra="128 esercizi su 200 sono rimasti senza per mesi: e' il campo che il pannello esiste per riempire."
                    rules={[{ max: 2000 }]}
                >
                    <Input.TextArea rows={6} autoSize={{ minRows: 6, maxRows: 14 }} />
                </Form.Item>
            </Form>

            {/*
                La foto solo su una voce salvata: la rotta e'
                `POST /api/admin/exercises/{id}/photo` e in creazione l'id non
                esiste ancora.
            */}
            {riga !== null && (
                <Flex align="center" gap={16}>
                    <CatalogImage nome={foto} lato={72} />
                    <PhotoUpload
                        endpoint={`/api/admin/exercises/${riga.id}/photo`}
                        campo="photo"
                        onCaricata={(nome) => {
                            setFoto(nome);
                            void client.invalidateQueries({ queryKey: ['exercises'] });
                            void client.invalidateQueries({ queryKey: ['stats'] });
                        }}
                    />
                </Flex>
            )}
        </Drawer>
    );
};
