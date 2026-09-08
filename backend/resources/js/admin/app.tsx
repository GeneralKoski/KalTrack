import { App as AntApp, ConfigProvider } from 'antd';
import itIT from 'antd/locale/it_IT';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { AuthProvider } from '@admin/auth/AuthProvider';
import { router } from '@admin/router';

const queryClient = new QueryClient({
    defaultOptions: {
        queries: { retry: false, refetchOnWindowFocus: false },
    },
});

/**
 * Il guscio: i provider, e l'ordine conta.
 *
 * `AuthProvider` sta DENTRO `QueryClientProvider` perche' la sessione la legge
 * con una query come tutto il resto, e SOPRA il router perche' la guardia
 * delle rotte la interroga.
 */
export const AdminApp = (): React.ReactElement => (
    <ConfigProvider locale={itIT}>
        <AntApp>
            <QueryClientProvider client={queryClient}>
                <AuthProvider>
                    <RouterProvider router={router} />
                </AuthProvider>
            </QueryClientProvider>
        </AntApp>
    </ConfigProvider>
);
