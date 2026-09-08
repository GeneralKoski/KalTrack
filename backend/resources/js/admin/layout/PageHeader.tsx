import type { ReactNode } from 'react';
import { Flex, Typography } from 'antd';

interface Props {
    titolo: string;
    sottotitolo?: string;
    azione?: ReactNode;
}

/**
 * Il titolo di una pagina, con la sua azione a destra.
 *
 * Scritto una volta: sei pagine che se lo ridisegnano si somigliano per copia
 * e divergono alla prima correzione fatta in una sola.
 */
export const PageHeader = ({ titolo, sottotitolo, azione }: Props): React.ReactElement => (
    <Flex justify="space-between" align="flex-start" style={{ marginBottom: 16 }} gap={16}>
        <div>
            <Typography.Title level={4} style={{ margin: 0 }}>
                {titolo}
            </Typography.Title>
            {sottotitolo !== undefined && (
                <Typography.Text type="secondary">{sottotitolo}</Typography.Text>
            )}
        </div>
        {azione}
    </Flex>
);
