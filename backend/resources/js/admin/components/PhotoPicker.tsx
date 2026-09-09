import { useEffect, useState } from 'react';
import { DeleteOutlined, UploadOutlined } from '@ant-design/icons';
import { App, Button, Flex, Typography, Upload } from 'antd';
import type { UploadProps } from 'antd';
import { CatalogImage } from '@admin/components/CatalogImage';

interface Props {
    /** Il nome della foto già salvata sulla voce, se ce n'è una. */
    nomeSalvato: string | null;
    /** Il file scelto e non ancora mandato, tenuto dal modulo. */
    scelto: File | null;
    onScelta: (file: File | null) => void;
}

/** Quel che il server accetta: `CatalogPhoto::MIMES` e `MAX_KB`. */
const ACCETTATI = '.jpg,.jpeg,.png,.webp';
const MAX_BYTE = 5120 * 1024;

/**
 * Scegliere la foto di una voce di catalogo, SENZA mandarla.
 *
 * Prima questo componente caricava il file appena scelto
 * (`POST .../{id}/photo` dentro `customRequest`), e da lì venivano tre
 * difetti che sembravano tre cose diverse:
 *
 * - la foto si salvava da sola. Chi la sbagliava l'aveva già scritta sulla
 *   voce, e "Annulla" non annullava niente;
 * - in creazione il riquadro non c'era affatto, perché la rotta vuole un id
 *   che non esiste ancora: l'unico modo di dare una foto a un esercizio o a
 *   un alimento nuovo era salvarlo e riaprirlo;
 * - il pannello aveva due momenti di scrittura per un solo modulo, e nessuno
 *   dei due era "Salva".
 *
 * Ora il file resta qui accanto (anteprima da `URL.createObjectURL`) e lo
 * manda il modulo dentro il suo salvataggio: in creazione dopo la POST, che
 * è quando l'id esiste. Un solo momento di scrittura, e in creazione la foto
 * si può scegliere prima di avere una voce.
 */
export const PhotoPicker = ({ nomeSalvato, scelto, onScelta }: Props): React.ReactElement => {
    const [anteprima, setAnteprima] = useState<string | null>(null);
    const { message } = App.useApp();

    /*
     * L'URL dell'oggetto si revoca, o ogni scelta lascia un blob in memoria
     * per tutta la vita della pagina - e in un pannello si aprono decine di
     * moduli senza mai ricaricare.
     */
    useEffect(() => {
        if (scelto === null) {
            setAnteprima(null);

            return;
        }

        const url = URL.createObjectURL(scelto);
        setAnteprima(url);

        return () => URL.revokeObjectURL(url);
    }, [scelto]);

    const prima: UploadProps['beforeUpload'] = (file) => {
        if (file.size > MAX_BYTE) {
            message.error('La foto supera i 5 MB che il server accetta.');

            return Upload.LIST_IGNORE;
        }

        onScelta(file);

        // `false`: niente richiesta. La manda il modulo al salvataggio.
        return false;
    };

    return (
        <Flex align="center" gap={16}>
            {anteprima === null ? (
                <CatalogImage nome={nomeSalvato} lato={72} />
            ) : (
                <img
                    src={anteprima}
                    width={72}
                    height={72}
                    style={{ objectFit: 'cover', borderRadius: 6 }}
                    alt=""
                />
            )}

            <Flex vertical align="flex-start" gap={4}>
                <Flex gap={8}>
                    <Upload
                        accept={ACCETTATI}
                        beforeUpload={prima}
                        showUploadList={false}
                        maxCount={1}
                    >
                        <Button icon={<UploadOutlined />}>
                            {nomeSalvato === null && scelto === null ? 'Scegli una foto' : 'Cambia'}
                        </Button>
                    </Upload>
                    {scelto !== null && (
                        <Button icon={<DeleteOutlined />} onClick={() => onScelta(null)}>
                            Annulla la scelta
                        </Button>
                    )}
                </Flex>
                {scelto !== null && (
                    <Typography.Text type="secondary">
                        Viene caricata quando premi Salva.
                    </Typography.Text>
                )}
            </Flex>
        </Flex>
    );
};
