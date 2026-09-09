import {
    AppstoreOutlined,
    DashboardOutlined,
    InboxOutlined,
    LogoutOutlined,
    TagsOutlined,
    ThunderboltOutlined,
    TeamOutlined,
} from '@ant-design/icons';
import { Button, Flex, Layout, Menu, Typography } from 'antd';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@admin/auth/AuthProvider';

/**
 * Ogni voce è un `Link`, cioè un vero `<a href>`, e non un `onClick` che
 * naviga.
 *
 * Con la sola `onClick` il cmd+click (ctrl+click su Windows) non apriva la
 * sezione in una scheda nuova: il browser non ha un indirizzo da aprire, e il
 * gestore navigava comunque nella scheda corrente - cioè il gesto faceva
 * l'opposto di quel che chiedeva. Un `<a>` lo fa gestire al browser, che sa
 * già cosa vuol dire cmd+click, e il click normale resta interno perché
 * `Link` lo intercetta.
 */
const VOCI = [
    { key: '/', icon: <DashboardOutlined />, label: <Link to="/">Dashboard</Link> },
    { key: '/proposte', icon: <InboxOutlined />, label: <Link to="/proposte">Proposte</Link> },
    { key: '/esercizi', icon: <ThunderboltOutlined />, label: <Link to="/esercizi">Esercizi</Link> },
    { key: '/alimenti', icon: <AppstoreOutlined />, label: <Link to="/alimenti">Alimenti</Link> },
    {
        key: '/tassonomie',
        icon: <TagsOutlined />,
        label: <Link to="/tassonomie">Tassonomie</Link>,
    },
    { key: '/utenti', icon: <TeamOutlined />, label: <Link to="/utenti">Utenti</Link> },
];

export const AdminLayout = (): React.ReactElement => {
    const { pathname } = useLocation();
    const { me, esci } = useAuth();

    return (
        <Layout style={{ minHeight: '100vh' }}>
            <Layout.Sider breakpoint="lg" collapsedWidth={64} theme="light">
                <Typography.Text strong style={{ display: 'block', padding: 16 }}>
                    KalTrack
                </Typography.Text>
                <Menu
                    mode="inline"
                    // Il percorso e' la chiave: senza `selectedKeys` la voce
                    // accesa sarebbe quella cliccata, e arrivando da un link
                    // diretto o da un ricaricamento non sarebbe accesa
                    // nessuna.
                    selectedKeys={[pathname]}
                    items={VOCI}
                />
            </Layout.Sider>
            <Layout>
                <Layout.Header style={{ background: '#fff', paddingInline: 24 }}>
                    <Flex justify="flex-end" align="center" gap={12}>
                        <Typography.Text type="secondary">{me?.displayName}</Typography.Text>
                        <Button icon={<LogoutOutlined />} onClick={() => void esci()}>
                            Esci
                        </Button>
                    </Flex>
                </Layout.Header>
                <Layout.Content style={{ padding: 24 }}>
                    <Outlet />
                </Layout.Content>
            </Layout>
        </Layout>
    );
};
