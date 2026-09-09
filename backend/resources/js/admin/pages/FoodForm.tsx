import { useEffect, useState } from 'react';
import {
    App,
    Button,
    Col,
    Drawer,
    Form,
    Input,
    InputNumber,
    Row,
    Space,
    Switch,
    Typography,
} from 'antd';
import type { FormInstance } from 'antd';
import { useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@admin/api/client';
import { applicaErroriServer } from '@admin/api/formErrors';
import type { FoodRow } from '@admin/api/types';
import { caricaFoto } from '@admin/api/photo';
import { PhotoPicker } from '@admin/components/PhotoPicker';
import { kcalFromMacros, macrosDiverge } from '@admin/domain/nutrition';

interface Props {
    riga: FoodRow | null;
    aperto: boolean;
    onChiudi: () => void;
}

interface Valori {
    name: string;
    brand: string | null;
    barcode: string | null;
    kcal: number;
    protein: number | null;
    carbs: number | null;
    sugars: number | null;
    fat: number | null;
    saturatedFat: number | null;
    fiber: number | null;
    salt: number | null;
    isLiquid: boolean;
    defaultServingG: number | null;
    servingLabel: string | null;
}

const CAMPI: (keyof Valori)[] = [
    'name',
    'brand',
    'barcode',
    'kcal',
    'protein',
    'carbs',
    'sugars',
    'fat',
    'saturatedFat',
    'fiber',
    'salt',
    'isLiquid',
    'defaultServingG',
    'servingLabel',
];

/** I sette nutrienti con la loro etichetta. Il tetto e' `Food::MAX_NUTRIENT_GRAMS`. */
const NUTRIENTI: { nome: 'protein' | 'carbs' | 'sugars' | 'fat' | 'saturatedFat' | 'fiber' | 'salt'; label: string }[] = [
    { nome: 'protein', label: 'Proteine (g)' },
    { nome: 'carbs', label: 'Carboidrati (g)' },
    { nome: 'sugars', label: 'di cui zuccheri (g)' },
    { nome: 'fat', label: 'Grassi (g)' },
    { nome: 'saturatedFat', label: 'di cui saturi (g)' },
    { nome: 'fiber', label: 'Fibre (g)' },
    { nome: 'salt', label: 'Sale (g)' },
];

/**
 * L'avviso sulle kcal.
 *
 * Un componente a se' e non una riga dentro il form: `Form.useWatch` ridisegna
 * chi lo chiama a ogni tasto, e messo accanto ai quindici campi li
 * ridisegnerebbe tutti mentre se ne scrive uno. E' la stessa ragione per cui
 * nell'app `KcalFromMacros` e' separato da `NutrientFields`.
 */
const AvvisoKcal = ({ form }: { form: FormInstance<Valori> }): React.ReactElement | null => {
    const protein = Form.useWatch('protein', form) ?? null;
    const carbs = Form.useWatch('carbs', form) ?? null;
    const fat = Form.useWatch('fat', form) ?? null;
    const kcal = Form.useWatch('kcal', form) ?? null;

    const daiMacro = kcalFromMacros(protein, carbs, fat);

    if (daiMacro === 0) {
        return null;
    }

    if (macrosDiverge(kcal, daiMacro)) {
        return (
            <Typography.Text type="warning">
                Le {kcal} kcal scritte non tornano con i macro, che ne spiegano {daiMacro}.
            </Typography.Text>
        );
    }

    return (
        <Typography.Text type="secondary">I macro scritti spiegano {daiMacro} kcal.</Typography.Text>
    );
};

export const FoodForm = ({ riga, aperto, onChiudi }: Props): React.ReactElement => {
    const [form] = Form.useForm<Valori>();
    const [inCorso, setInCorso] = useState(false);
    const [immagine, setImmagine] = useState<string | null>(null);
    const [immagineScelta, setImmagineScelta] = useState<File | null>(null);
    const client = useQueryClient();
    const { message } = App.useApp();

    useEffect(() => {
        if (!aperto) {
            return;
        }

        setImmagine(riga?.image ?? null);
        // La scelta non sopravvive alla chiusura: riaprendo un'altra voce, un
        // file rimasto qui verrebbe caricato sull'alimento sbagliato.
        setImmagineScelta(null);

        if (riga === null) {
            form.resetFields();

            return;
        }

        form.setFieldsValue({
            name: riga.name,
            brand: riga.brand,
            barcode: riga.barcode,
            kcal: riga.kcal,
            protein: riga.protein,
            carbs: riga.carbs,
            sugars: riga.sugars,
            fat: riga.fat,
            saturatedFat: riga.saturatedFat,
            fiber: riga.fiber,
            salt: riga.salt,
            isLiquid: riga.isLiquid,
            defaultServingG: riga.defaultServingG,
            servingLabel: riga.servingLabel,
        });
    }, [aperto, riga, form]);

    const salva = async (valori: Valori): Promise<void> => {
        /*
         * `InputNumber` svuotato manda gia' `null` (i sette nutrienti e la
         * porzione non hanno bisogno di niente): e' `Input` a mandare `''`,
         * ed e' un'asimmetria di antd, non nostra. Senza normalizzare questi
         * tre la colonna finisce con una stringa vuota che non e' ne'
         * assente ne' un valore vero - e per il barcode, che e' identita' e
         * non contenuto, e' peggio: un filtro esatto su `''` farebbe
         * rispondere alla stessa ricerca ogni alimento rimasto senza codice.
         */
        const corpo = {
            ...valori,
            brand: valori.brand === '' ? null : valori.brand,
            barcode: valori.barcode === '' ? null : valori.barcode,
            servingLabel: valori.servingLabel === '' ? null : valori.servingLabel,
        };

        setInCorso(true);

        try {
            /*
             * La foto va dopo, e in creazione non c'e' alternativa: la rotta
             * e' `POST .../{id}/image` e l'id nasce con questa risposta.
             */
            let id = riga?.id;

            if (riga === null) {
                const creato = await apiFetch<{ data: FoodRow }>('/api/admin/foods', {
                    method: 'POST',
                    body: corpo,
                });
                id = creato.data.id;
            } else {
                await apiFetch(`/api/admin/foods/${riga.id}`, { method: 'PATCH', body: corpo });
            }

            if (immagineScelta !== null && id !== undefined) {
                await caricaFoto(`/api/admin/foods/${id}/image`, immagineScelta);
            }

            await client.invalidateQueries({ queryKey: ['foods'] });
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
            size={620}
            title={riga === null ? 'Nuovo alimento' : riga.name}
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
            <Form
                form={form}
                layout="vertical"
                onFinish={salva}
                requiredMark={false}
                initialValues={{ isLiquid: false }}
            >
                <Row gutter={16}>
                    <Col span={14}>
                        <Form.Item
                            name="name"
                            label="Nome"
                            rules={[{ required: true, message: 'Serve un nome.' }, { max: 120 }]}
                        >
                            <Input />
                        </Form.Item>
                    </Col>
                    <Col span={10}>
                        <Form.Item name="brand" label="Marca" rules={[{ max: 60 }]}>
                            <Input />
                        </Form.Item>
                    </Col>
                </Row>

                <Typography.Title level={5}>Per 100 g</Typography.Title>
                <Row gutter={16}>
                    <Col span={8}>
                        <Form.Item
                            name="kcal"
                            label="Energia (kcal)"
                            rules={[{ required: true, message: 'Servono le kcal.' }]}
                        >
                            <InputNumber min={0} max={1000} style={{ width: '100%' }} />
                        </Form.Item>
                    </Col>
                    {NUTRIENTI.map(({ nome, label }) => (
                        <Col span={8} key={nome}>
                            <Form.Item name={nome} label={label}>
                                <InputNumber min={0} max={100} style={{ width: '100%' }} />
                            </Form.Item>
                        </Col>
                    ))}
                </Row>
                <div style={{ marginBottom: 16 }}>
                    <AvvisoKcal form={form} />
                </div>

                <Row gutter={16}>
                    <Col span={8}>
                        <Form.Item name="defaultServingG" label="Porzione (g)">
                            <InputNumber min={0} max={9999} style={{ width: '100%' }} />
                        </Form.Item>
                    </Col>
                    <Col span={10}>
                        <Form.Item
                            name="servingLabel"
                            label="Come si dice"
                            extra={'"1 vasetto = 125 g": la frase che risponde alla domanda che uno si fa mentre digita i grammi.'}
                            rules={[{ max: 40 }]}
                        >
                            <Input />
                        </Form.Item>
                    </Col>
                    <Col span={6}>
                        <Form.Item name="isLiquid" label="Liquido" valuePropName="checked">
                            <Switch />
                        </Form.Item>
                    </Col>
                </Row>

                <Form.Item
                    name="barcode"
                    label="Codice a barre"
                    extra="Identita' esatta: due prodotti con lo stesso codice sono lo stesso prodotto."
                    rules={[{ max: 32 }]}
                >
                    <Input />
                </Form.Item>
            </Form>

            {/*
                Anche in creazione: il file resta qui e lo manda `salva` dopo
                la POST, quando l'id esiste.
            */}
            <PhotoPicker
                nomeSalvato={immagine}
                scelto={immagineScelta}
                onScelta={setImmagineScelta}
            />
        </Drawer>
    );
};
