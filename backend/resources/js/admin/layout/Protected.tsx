import { Flex, Spin } from 'antd';
import { Navigate, useLocation } from 'react-router-dom';
import { AdminLayout } from '@admin/layout/AdminLayout';
import { useAuth } from '@admin/auth/AuthProvider';

/**
 * Il guscio, ma solo per chi e' entrato.
 *
 * Lo stato `attesa` ha una schermata sua e non cade nel ramo dell'anonimo:
 * finche' `GET /api/me` non ha risposto non si sa niente, e rimandare al login
 * chi e' gia' dentro gli farebbe vedere un modulo di accesso lampeggiare a
 * ogni ricaricamento.
 */
export const Protected = (): React.ReactElement => {
    const { stato } = useAuth();
    const { pathname } = useLocation();

    if (stato === 'attesa') {
        return (
            <Flex align="center" justify="center" style={{ minHeight: '100vh' }}>
                <Spin size="large" />
            </Flex>
        );
    }

    if (stato === 'anonimo') {
        return <Navigate to="/login" replace state={{ da: pathname }} />;
    }

    return <AdminLayout />;
};
