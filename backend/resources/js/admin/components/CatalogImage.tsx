import { PictureOutlined } from '@ant-design/icons';
import { Image } from 'antd';

interface Props {
    nome: string | null;
    lato?: number;
}

/**
 * La foto di una voce di catalogo.
 *
 * I byte stanno fuori da `public/` e li serve `GET /api/catalog/images/{name}`,
 * che e' sotto `auth:sanctum`: funziona da un `<img>` perche' il browser manda
 * il cookie di sessione anche sulle richieste di risorse, essendo lo stesso
 * host. Niente token, niente URL firmate.
 *
 * Senza foto un riquadro con l'icona e non uno spazio vuoto: lo spazio vuoto
 * sembra un difetto di caricamento, l'icona dice che la foto non c'e'.
 */
export const CatalogImage = ({ nome, lato = 48 }: Props): React.ReactElement =>
    nome === null ? (
        <div
            style={{
                width: lato,
                height: lato,
                borderRadius: 6,
                background: '#f5f5f5',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#bfbfbf',
            }}
        >
            <PictureOutlined />
        </div>
    ) : (
        <Image
            src={`/api/catalog/images/${nome}`}
            width={lato}
            height={lato}
            style={{ objectFit: 'cover', borderRadius: 6 }}
            alt=""
        />
    );
