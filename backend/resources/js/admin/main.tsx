// Per primo, prima di qualunque import di AntD: la patch rimette in piedi i
// metodi statici di AntD 5 su React 19, che senza non montano niente.
import '@ant-design/v5-patch-for-react-19';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AdminApp } from '@admin/app';

const root = document.getElementById('admin-root');

if (root !== null) {
    createRoot(root).render(
        <StrictMode>
            <AdminApp />
        </StrictMode>,
    );
}
