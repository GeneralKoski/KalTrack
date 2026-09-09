import { useEffect, useState } from 'react';
import { App, Button, Drawer, Form, Input, Select, Space } from 'antd';
import { useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@admin/api/client';
import { applicaErroriServer } from '@admin/api/formErrors';
import { caricaFoto } from '@admin/api/photo';
import { opzioniTassonomia, useTaxonomy } from '@admin/api/taxonomies';
import type { ExerciseRow } from '@admin/api/types';
import { PhotoPicker } from '@admin/components/PhotoPicker';
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
    const [fotoScelta, setFotoScelta] = useState<File | null>(null);
    const gruppi = useTaxonomy('muscle-groups');
    const attrezzi = useTaxonomy('equipment');
    const client = useQueryClient();
    const { message } = App.useApp();

    useEffect(() => {
        if (!aperto) {
            return;
        }

        setFoto(riga?.photo ?? null);
        // La scelta non sopravvive alla chiusura: riaprendo un'altra voce, un
        // file rimasto qui verrebbe caricato sulla voce sbagliata.
        setFotoScelta(null);

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
            /*
             * La foto va dopo, e in creazione non c'e' alternativa: la rotta
             * e' `POST .../{id}/photo` e l'id nasce con questa risposta.
             */
            let id = riga?.id;

            if (riga === null) {
                const creato = await apiFetch<{ data: ExerciseRow }>('/api/admin/exercises', {
                    method: 'POST',
                    body: corpo,
                });
                id = creato.data.id;
            } else {
                await apiFetch(`/api/admin/exercises/${riga.id}`, { method: 'PATCH', body: corpo });
            }

            if (fotoScelta !== null && id !== undefined) {
                await caricaFoto(`/api/admin/exercises/${id}/photo`, fotoScelta);
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
            size={560}
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
                        showSearch={{ optionFilterProp: 'label' }}
                    />
                </Form.Item>
                <Form.Item name="secondaryMuscles" label="Muscoli secondari">
                    <Select
                        mode="multiple"
                        options={opzioniTassonomia(gruppi.data)}
                        loading={gruppi.isPending}
                        showSearch={{ optionFilterProp: 'label' }}
                        allowClear
                    />
                </Form.Item>
                <Form.Item name="equipment" label="Attrezzatura">
                    <Select
                        mode="multiple"
                        options={opzioniTassonomia(attrezzi.data)}
                        loading={attrezzi.isPending}
                        showSearch={{ optionFilterProp: 'label' }}
                        allowClear
                    />
                </Form.Item>
                <Form.Item
                    name="instructions"
                    label="Come si esegue"
                    extra="128 esercizi su 200 sono rimasti senza per mesi: è il campo che il pannello esiste per riempire."
                    rules={[{ max: 2000 }]}
                >
                    <Input.TextArea rows={6} autoSize={{ minRows: 6, maxRows: 14 }} />
                </Form.Item>
            </Form>

            {/*
                Anche in creazione: il file resta qui e lo manda `salva` dopo
                la POST, quando l'id esiste. Prima il riquadro compariva solo
                su una voce già salvata, e l'unico modo di dare una foto a un
                esercizio nuovo era salvarlo e riaprirlo.
            */}
            <PhotoPicker nomeSalvato={foto} scelto={fotoScelta} onScelta={setFotoScelta} />
        </Drawer>
    );
};
