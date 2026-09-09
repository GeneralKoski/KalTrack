import { Alert, Card, Col, Row, Skeleton, Statistic, Typography } from 'antd';
import { Link } from 'react-router-dom';
import { messageOf } from '@admin/api/errors';
import { useStats } from '@admin/api/stats';
import { PageHeader } from '@admin/layout/PageHeader';

export const DashboardPage = (): React.ReactElement => {
    // La lettura sta in `useStats` e non qui perche' non e' piu' solo di
    // questa pagina: i segmenti della coda di revisione mostrano gli stessi
    // due numeri, e da due letture diverse potrebbero divergere.
    const { data, isPending, error } = useStats();

    if (error !== null) {
        return (
            <>
                <PageHeader titolo="Dashboard" />
                <Alert type="error" showIcon title={messageOf(error)} />
            </>
        );
    }

    if (isPending) {
        return (
            <>
                <PageHeader titolo="Dashboard" />
                <Skeleton active />
            </>
        );
    }

    return (
        <>
            <PageHeader titolo="Dashboard" />
            <Row gutter={[16, 16]}>
                <Col xs={24} sm={12} lg={6}>
                    <Card>
                        <Statistic
                            title="Proposte in attesa"
                            value={data.pending.exercises + data.pending.foods}
                        />
                        <Link to="/proposte">Vai alla coda</Link>
                    </Card>
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <Card>
                        <Statistic title="Iscritti" value={data.users} />
                        <Link to="/utenti">Vedi gli utenti</Link>
                    </Card>
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <Card>
                        <Statistic title="Esercizi pubblicati" value={data.published.exercises} />
                        <Link to="/esercizi">Apri il catalogo</Link>
                    </Card>
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <Card>
                        <Statistic title="Alimenti pubblicati" value={data.published.foods} />
                        <Link to="/alimenti">Apri il catalogo</Link>
                    </Card>
                </Col>
            </Row>

            <Typography.Title level={5} style={{ marginTop: 24 }}>
                Cosa manca
            </Typography.Title>
            <Typography.Paragraph type="secondary">
                Conta solo gli esercizi <strong>pubblicati</strong>: una proposta ancora in coda non
                è un buco nel catalogo, è una riga da revisionare.
            </Typography.Paragraph>
            <Row gutter={[16, 16]}>
                <Col xs={24} sm={12}>
                    <Card>
                        <Statistic title="Esercizi senza descrizione" value={data.missing.instructions} />
                        {/*
                            Il numero e il filtro che ci porta dentro sono le
                            due metà dello stesso rimedio: sapere che 128
                            esercizi sono muti non serve a niente se poi non
                            si sa quali.
                        */}
                        <Link to="/esercizi?missing=instructions">Vedi quali</Link>
                    </Card>
                </Col>
                <Col xs={24} sm={12}>
                    <Card>
                        <Statistic title="Esercizi senza foto" value={data.missing.photos} />
                        <Link to="/esercizi?missing=photo">Vedi quali</Link>
                    </Card>
                </Col>
            </Row>
        </>
    );
};
