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
