import { useEffect, useState } from 'react';
import {
    App,
    Button,
    Col,
    Descriptions,
    Drawer,
    Form,
    Input,
    InputNumber,
    Row,
    Select,
    Space,
    Switch,
} from 'antd';
import { useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@admin/api/client';
import { messageOf } from '@admin/api/errors';
import { applicaErroriServer } from '@admin/api/formErrors';
import { opzioniTassonomia, useTaxonomy } from '@admin/api/taxonomies';
import type { SubmissionRow } from '@admin/api/types';
import { changedFields } from '@admin/domain/changes';
import { joinCsv, splitCsv } from '@admin/domain/csv';

interface Props {
    proposta: SubmissionRow | null;
    aperto: boolean;
    onChiudi: () => void;
}

/*
 * `fields` arriva come `Record<string, unknown>` perche' la sua forma dipende
 * dal tipo. Quattro letture strette invece di un cast: il server puo' mandare
 * `null` su qualunque colonna nullable, e un `as number` su un null farebbe
 * scrivere "null" dentro un campo numerico senza che niente protesti.
 */
const testo = (valore: unknown): string | null => (typeof valore === 'string' ? valore : null);
const numero = (valore: unknown): number | null => (typeof valore === 'number' ? valore : null);
const booleano = (valore: unknown): boolean => valore === true;

/*
 * La quarta lettura serve altrove: non su `fields` ma su `form.getFieldsValue()`,
 * che e' lo stesso genere di `Record<string, unknown>`. Un `Select
 * mode="multiple"` promette un `string[]`, ma e' una promessa di AntD e non
 * un fatto che il tipo di `valori` porti scritto - un `as string[]` la
 * accetterebbe senza controllare. Si filtra invece: quel che non e' una
 * stringa sparisce, e un valore che non e' nemmeno un array diventa elenco
 * vuoto.
 */
const elenco = (valore: unknown): string[] =>
    Array.isArray(valore) ? valore.filter((v): v is string => typeof v === 'string') : [];

/** I campi che si correggono, per tipo, gia' nella forma che il server accetta. */
function valoriIniziali(proposta: SubmissionRow): Record<string, unknown> {
    const f = proposta.fields;

    if (proposta.type === 'exercise') {
        return {
            name: proposta.name,
            muscleGroup: testo(f.muscleGroup) ?? '',
            secondaryMuscles: testo(f.secondaryMuscles),
            equipment: testo(f.equipment),
            instructions: testo(f.instructions),
        };
    }

    return {
        name: proposta.name,
        brand: testo(f.brand),
        barcode: testo(f.barcode),
        kcal: numero(f.kcal) ?? 0,
        protein: numero(f.protein),
        carbs: numero(f.carbs),
        sugars: numero(f.sugars),
        fat: numero(f.fat),
        saturatedFat: numero(f.saturatedFat),
        fiber: numero(f.fiber),
        salt: numero(f.salt),
        isLiquid: booleano(f.isLiquid),
        defaultServingG: numero(f.defaultServingG),
        servingLabel: testo(f.servingLabel),
    };
}

/*
 * I campi da correggere, per l'`applicaErroriServer` sotto: la STESSA lista
 * che decide cosa disegnare, cioe' le chiavi di `valoriIniziali`. Derivarli
 * da li' invece di scrivere un secondo elenco a mano vuol dire che il modulo
 * e la lista degli errori non possono disallinearsi.
 */
function campiDelModulo(proposta: SubmissionRow): string[] {
    return Object.keys(valoriIniziali(proposta));
}

/*
 * `InputNumber` svuotato manda gia' `null`; e' `Input`/`Input.TextArea` a
 * mandare `''` quando si svuotano - un'asimmetria di antd, non nostra (vedi
 * `FoodForm`). Qui conta piu' che li': il valore normalizzato alimenta
 * `changedFields`, e senza normalizzare PRIMA una proposta con la marca
 * vuota, approvata intonsa, confronterebbe il `null` di `valoriIniziali` con
 * la `''` uscita dal modulo - e manderebbe una correzione che nessuno ha
 * fatto.
 */
const CAMPI_TESTO_OPZIONALI = ['brand', 'barcode', 'servingLabel', 'instructions'] as const;

function normalizzaTesto(valori: Record<string, unknown>): Record<string, unknown> {
    const normalizzati = { ...valori };

    for (const chiave of CAMPI_TESTO_OPZIONALI) {
        if (normalizzati[chiave] === '') {
            normalizzati[chiave] = null;
        }
    }

    return normalizzati;
}

const NUTRIENTI: [string, string][] = [
    ['protein', 'Proteine (g)'],
    ['carbs', 'Carboidrati (g)'],
    ['sugars', 'Zuccheri (g)'],
    ['fat', 'Grassi (g)'],
    ['saturatedFat', 'Saturi (g)'],
    ['fiber', 'Fibre (g)'],
    ['salt', 'Sale (g)'],
];

export const ReviewDrawer = ({ proposta, aperto, onChiudi }: Props): React.ReactElement => {
    const [form] = Form.useForm<Record<string, unknown>>();
    const [inCorso, setInCorso] = useState(false);
    const gruppi = useTaxonomy('muscle-groups');
    const attrezzi = useTaxonomy('equipment');
    const client = useQueryClient();
    const { message } = App.useApp();

    useEffect(() => {
        if (!aperto || proposta === null) {
            return;
        }

        const iniziali = valoriIniziali(proposta);
        form.setFieldsValue(
            proposta.type === 'exercise'
                ? {
                      ...iniziali,
                      // Le due colonne a virgole diventano tendine, e tornano
                      // stringa al momento di mandarle.
                      secondaryMuscles: splitCsv(testo(proposta.fields.secondaryMuscles)),
                      equipment: splitCsv(testo(proposta.fields.equipment)),
                  }
                : iniziali,
        );
    }, [aperto, proposta, form]);

    if (proposta === null) {
        return <Drawer open={false} onClose={onChiudi} />;
    }

    const dopoLaDecisione = async (): Promise<void> => {
        await client.invalidateQueries({ queryKey: ['submissions'] });
        await client.invalidateQueries({ queryKey: ['stats'] });
        /*
         * Anche il catalogo del tipo deciso: approvare ci mette una riga
         * dentro. Oggi non si vedeva perche' quelle query hanno `staleTime`
         * zero e si rileggono al montaggio, cioe' il difetto era latente -
         * il giorno che una delle due prendesse uno `staleTime`, chi passa da
         * Proposte a Esercizi vedrebbe un catalogo senza la voce appena
         * approvata.
         */
        await client.invalidateQueries({
            queryKey: [proposta.type === 'exercise' ? 'exercises' : 'foods'],
        });
        onChiudi();
    };

    const approva = async (): Promise<void> => {
        const valori = form.getFieldsValue();
        const dopoCsv =
            proposta.type === 'exercise'
                ? {
                      ...valori,
                      secondaryMuscles: joinCsv(elenco(valori.secondaryMuscles)),
                      equipment: joinCsv(elenco(valori.equipment)),
                  }
                : valori;
        const dopo = normalizzaTesto(dopoCsv);

        /*
         * Solo le correzioni. `approve` scrive quel che riceve, e rimandare
         * anche i campi non toccati farebbe ripassare il nome dal controllo
         * di unicita' su `name_norm` per una voce a cui nessuno ha cambiato
         * il nome.
         */
        const correzioni = changedFields(valoriIniziali(proposta), dopo);

        setInCorso(true);

        try {
            await apiFetch(`/api/admin/submissions/${proposta.type}/${proposta.id}/approve`, {
                method: 'POST',
                body: correzioni,
            });
            message.success('Approvata: e\' nel catalogo di tutti.');
            await dopoLaDecisione();
        } catch (error) {
            applicaErroriServer(form, campiDelModulo(proposta), error, message.error);
        } finally {
            setInCorso(false);
        }
    };

    /*
     * Il rifiuto non porta una nota, e non e' una semplificazione: quella
     * nota non e' mai stata mostrata all'autore - `review_note` la leggeva
     * solo chi guardava il database - quindi era un campo obbligatorio che
     * chiedeva di motivare una decisione a nessuno. Il server accetta ancora
     * `note` come `sometimes`, e non riceverlo va bene.
     */
    const rifiuta = async (): Promise<void> => {
        setInCorso(true);

        try {
            await apiFetch(`/api/admin/submissions/${proposta.type}/${proposta.id}/reject`, {
                method: 'POST',
            });
            message.success('Rifiutata. Resta sul telefono di chi l\'ha scritta.');
            await dopoLaDecisione();
        } catch (error) {
            message.error(messageOf(error));
        } finally {
            setInCorso(false);
        }
    };

    return (
        <Drawer
            open={aperto}
            size={620}
            title={proposta.name}
            onClose={onChiudi}
            destroyOnHidden
            extra={
                <Space>
                    <Button danger loading={inCorso} onClick={() => void rifiuta()}>
                        Rifiuta
                    </Button>
                    <Button type="primary" loading={inCorso} onClick={() => void approva()}>
                        Approva
                    </Button>
                </Space>
            }
        >
            <Descriptions
                size="small"
                column={1}
                style={{ marginBottom: 16 }}
                items={[
                    {
                        key: 'tipo',
                        label: 'Tipo',
                        children: proposta.type === 'exercise' ? 'Esercizio' : 'Alimento',
                    },
                    {
                        // L'unico posto del pannello dove si vede chi ha proposto.
                        key: 'autore',
                        label: 'Proposta da',
                        children: proposta.author?.displayName ?? 'autore cancellato',
                    },
                    {
                        key: 'il',
                        label: 'Il',
                        children:
                            proposta.createdAt === null
                                ? '-'
                                : new Date(proposta.createdAt).toLocaleDateString('it-IT'),
                    },
                ]}
            />

            <Form form={form} layout="vertical" requiredMark={false}>
                <Form.Item name="name" label="Nome">
                    <Input />
                </Form.Item>

                {proposta.type === 'exercise' ? (
                    <>
                        <Form.Item name="muscleGroup" label="Gruppo muscolare">
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
                        <Form.Item name="instructions" label="Come si esegue">
                            <Input.TextArea rows={5} />
                        </Form.Item>
                    </>
                ) : (
                    <>
                        <Row gutter={16}>
                            <Col span={12}>
                                <Form.Item name="brand" label="Marca">
                                    <Input />
                                </Form.Item>
                            </Col>
                            <Col span={12}>
                                <Form.Item name="barcode" label="Codice a barre">
                                    <Input />
                                </Form.Item>
                            </Col>
                        </Row>
                        <Row gutter={16}>
                            <Col span={8}>
                                <Form.Item name="kcal" label="Energia (kcal)">
                                    <InputNumber min={0} max={1000} style={{ width: '100%' }} />
                                </Form.Item>
                            </Col>
                            {NUTRIENTI.map(([nome, label]) => (
                                <Col span={8} key={nome}>
                                    <Form.Item name={nome} label={label}>
                                        <InputNumber min={0} max={100} style={{ width: '100%' }} />
                                    </Form.Item>
                                </Col>
                            ))}
                        </Row>
                        <Row gutter={16}>
                            <Col span={8}>
                                <Form.Item name="defaultServingG" label="Porzione (g)">
                                    <InputNumber min={0} max={9999} style={{ width: '100%' }} />
                                </Form.Item>
                            </Col>
                            <Col span={10}>
                                <Form.Item name="servingLabel" label="Come si dice">
                                    <Input />
                                </Form.Item>
                            </Col>
                            <Col span={6}>
                                <Form.Item name="isLiquid" label="Liquido" valuePropName="checked">
                                    <Switch />
                                </Form.Item>
                            </Col>
                        </Row>
                    </>
                )}
            </Form>

        </Drawer>
    );
};
