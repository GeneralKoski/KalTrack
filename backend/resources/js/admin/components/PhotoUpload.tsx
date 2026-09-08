import { useState } from 'react';
import { UploadOutlined } from '@ant-design/icons';
import { App, Button, Upload } from 'antd';
import type { UploadProps } from 'antd';
import { apiFetch } from '@admin/api/client';
import { messageOf } from '@admin/api/errors';

interface Props {
    /** La rotta a cui mandare il file, gia' completa dell'id. */
    endpoint: string;
    /** La chiave della risposta: `photo` per gli esercizi, `image` per gli alimenti. */
    campo: 'photo' | 'image';
    onCaricata: (nome: string) => void;
}

/** Quel che il server accetta: `CatalogPhoto::MIMES` e `MAX_KB`. */
const ACCETTATI = '.jpg,.jpeg,.png,.webp';
const MAX_BYTE = 5120 * 1024;

/**
 * L'unica richiesta del pannello che non manda JSON.
 *
 * `customRequest` invece dell'upload di serie di AntD: quello fa un `fetch`
 * suo, senza il cookie e senza il token CSRF, e ogni caricamento tornerebbe
 * 419. Passando da `apiFetch` il giro e' quello di tutti gli altri.
 *
 * La foto si carica solo su una voce che ESISTE: la rotta e'
 * `POST .../{id}/photo`, quindi in creazione il riquadro non c'e' e compare
 * appena la voce e' salvata.
 */
export const PhotoUpload = ({ endpoint, campo, onCaricata }: Props): React.ReactElement => {
    const [inCorso, setInCorso] = useState(false);
    const { message } = App.useApp();

    const carica: UploadProps['customRequest'] = async ({ file, onSuccess, onError }) => {
        if (!(file instanceof File)) {
            return;
        }

        if (file.size > MAX_BYTE) {
            message.error('La foto supera i 5 MB che il server accetta.');
            onError?.(new Error('troppo grande'));

            return;
        }

        const corpo = new FormData();
        corpo.append('file', file);
        setInCorso(true);

        try {
            const risposta = await apiFetch<Record<string, string>>(endpoint, {
                method: 'POST',
                body: corpo,
            });
            onCaricata(risposta[campo]);
            message.success('Foto caricata.');
            onSuccess?.(risposta);
        } catch (error) {
            message.error(messageOf(error));
            onError?.(error instanceof Error ? error : new Error('caricamento fallito'));
        } finally {
            setInCorso(false);
        }
    };

    return (
        <Upload accept={ACCETTATI} customRequest={carica} showUploadList={false} maxCount={1}>
            <Button icon={<UploadOutlined />} loading={inCorso}>
                Carica una foto
            </Button>
        </Upload>
    );
};
