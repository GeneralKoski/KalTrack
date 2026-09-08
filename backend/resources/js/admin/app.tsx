import { App as AntApp, ConfigProvider, Typography } from 'antd';
import itIT from 'antd/locale/it_IT';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/*
 * `retry: false`: un 401 o un 403 non migliorano riprovando, e il default di
 * Query e' tre tentativi - tre richieste per dire la stessa cosa, e il triplo
 * del tempo prima che la schermata lo dica.
 */
const queryClient = new QueryClient({
    defaultOptions: {
        queries: { retry: false, refetchOnWindowFocus: false },
    },
});

/**
 * Il guscio: i provider e nient'altro.
 *
 * Il corpo diventa il router nel Task 4. Tenerlo separato da `main.tsx` e'
 * cio' che permette a un test di rendere l'app senza un DOM da montare.
 */
export const AdminApp = (): React.ReactElement => (
    <ConfigProvider locale={itIT}>
        <AntApp>
            <QueryClientProvider client={queryClient}>
                <Typography.Title level={3}>Gestionale KalTrack</Typography.Title>
            </QueryClientProvider>
        </AntApp>
    </ConfigProvider>
);
