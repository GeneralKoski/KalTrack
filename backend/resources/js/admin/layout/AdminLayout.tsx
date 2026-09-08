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
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@admin/auth/AuthProvider';

const VOCI = [
    { key: '/', icon: <DashboardOutlined />, label: 'Dashboard' },
    { key: '/proposte', icon: <InboxOutlined />, label: 'Proposte' },
    { key: '/esercizi', icon: <ThunderboltOutlined />, label: 'Esercizi' },
    { key: '/alimenti', icon: <AppstoreOutlined />, label: 'Alimenti' },
    { key: '/tassonomie', icon: <TagsOutlined />, label: 'Tassonomie' },
    { key: '/utenti', icon: <TeamOutlined />, label: 'Utenti' },
];

export const AdminLayout = (): React.ReactElement => {
    const naviga = useNavigate();
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
                    onClick={({ key }) => naviga(key)}
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
