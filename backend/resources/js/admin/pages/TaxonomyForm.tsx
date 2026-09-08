import { useEffect, useState } from 'react';
import { App, Form, Input, InputNumber, Modal } from 'antd';
import { useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@admin/api/client';
import { applicaErroriServer } from '@admin/api/formErrors';
import { chiaveTassonomia } from '@admin/api/taxonomies';
import type { TaxonomyKind, TaxonomyRow } from '@admin/api/types';

interface Props {
    kind: TaxonomyKind;
    riga: TaxonomyRow | null;
    aperto: boolean;
    onChiudi: () => void;
}

interface Valori {
    slug: string;
    labelIt: string;
    labelEn: string;
    sort: number;
}

const CAMPI: (keyof Valori)[] = ['slug', 'labelIt', 'labelEn', 'sort'];

export const TaxonomyForm = ({ kind, riga, aperto, onChiudi }: Props): React.ReactElement => {
    const [form] = Form.useForm<Valori>();
    const [inCorso, setInCorso] = useState(false);
    const client = useQueryClient();
    const { message } = App.useApp();

    /*
     * Il modulo si riempie dalla riga e si svuota alla chiusura: riaprendolo
     * su "Nuovo" dopo una correzione mostrerebbe altrimenti i valori di
     * quella. E' la stessa regola dei fogli dell'app.
     */
    useEffect(() => {
        if (!aperto) {
            return;
        }

        if (riga === null) {
            form.resetFields();
        } else {
            form.setFieldsValue({
                slug: riga.slug,
                labelIt: riga.labelIt,
                labelEn: riga.labelEn,
                sort: riga.sort,
            });
        }
    }, [aperto, riga, form]);

    const salva = async (valori: Valori): Promise<void> => {
        setInCorso(true);

        try {
            if (riga === null) {
                await apiFetch(`/api/admin/taxonomies/${kind}`, { method: 'POST', body: { ...valori } });
            } else {
                /*
                 * Lo slug non entra nella PATCH, e il server lo ignorerebbe
                 * comunque: e' quel che sta scritto in colonna su ogni
                 * esercizio che nomina questa voce, e riscriverlo li
                 * lascerebbe orfani tutti in una volta, qui e su ogni
                 * telefono.
                 */
                await apiFetch(`/api/admin/taxonomies/${kind}/${riga.id}`, {
                    method: 'PATCH',
                    body: { labelIt: valori.labelIt, labelEn: valori.labelEn, sort: valori.sort },
                });
            }

            await client.invalidateQueries({ queryKey: chiaveTassonomia(kind) });
            message.success('Salvato.');
            onChiudi();
        } catch (error) {
            applicaErroriServer(form, CAMPI, error, message.error);
        } finally {
            setInCorso(false);
        }
    };

    return (
        <Modal
            open={aperto}
            title={riga === null ? 'Nuova voce' : riga.labelIt}
            okText="Salva"
            cancelText="Annulla"
            confirmLoading={inCorso}
            onOk={() => void form.submit()}
            onCancel={onChiudi}
            destroyOnHidden
        >
            <Form form={form} layout="vertical" onFinish={salva} initialValues={{ sort: 0 }}>
                <Form.Item
                    name="slug"
                    label="Identificativo"
                    rules={[{ required: true, message: 'Serve un identificativo.' }]}
                    extra={
                        riga === null
                            ? 'Non si potra\' piu\' cambiare: e\' quel che sta scritto su ogni esercizio che lo nomina.'
                            : 'Non si cambia. Rinominare la voce cambia le etichette, non l\'identificativo.'
                    }
                >
                    <Input disabled={riga !== null} />
                </Form.Item>
                <Form.Item
                    name="labelIt"
                    label="Etichetta italiana"
                    rules={[{ required: true, message: 'Serve l\'etichetta italiana.' }]}
                >
                    <Input />
                </Form.Item>
                <Form.Item
                    name="labelEn"
                    label="Etichetta inglese"
                    rules={[{ required: true, message: 'Serve l\'etichetta inglese.' }]}
                >
                    <Input />
                </Form.Item>
                <Form.Item name="sort" label="Ordine">
                    <InputNumber min={0} max={9999} style={{ width: '100%' }} />
                </Form.Item>
            </Form>
        </Modal>
    );
};
