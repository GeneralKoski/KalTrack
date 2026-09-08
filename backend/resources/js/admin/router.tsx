import { createBrowserRouter } from 'react-router-dom';
import type { RouteObject } from 'react-router-dom';
import { LoginPage } from '@admin/auth/LoginPage';
import { Protected } from '@admin/layout/Protected';
import { DashboardPage } from '@admin/pages/DashboardPage';
import { SubmissionsPage } from '@admin/pages/SubmissionsPage';
import { ExercisesPage } from '@admin/pages/ExercisesPage';
import { FoodsPage } from '@admin/pages/FoodsPage';
import { TaxonomiesPage } from '@admin/pages/TaxonomiesPage';
import { UsersPage } from '@admin/pages/UsersPage';

/*
 * Le rotte separate dal router: `createMemoryRouter` le riusa nei test, dove
 * un `createBrowserRouter` leggerebbe la barra degli indirizzi di jsdom.
 */
export const rotte: RouteObject[] = [
    { path: '/login', element: <LoginPage /> },
    {
        path: '/',
        element: <Protected />,
        children: [
            { index: true, element: <DashboardPage /> },
            { path: 'proposte', element: <SubmissionsPage /> },
            { path: 'esercizi', element: <ExercisesPage /> },
            { path: 'alimenti', element: <FoodsPage /> },
            { path: 'tassonomie', element: <TaxonomiesPage /> },
            { path: 'utenti', element: <UsersPage /> },
        ],
    },
];

/*
 * `basename: '/admin'`: la SPA vive sotto quel prefisso e il catch-all
 * `GET /admin/{any?}` rende la stessa vista per ogni percorso. Senza, ogni
 * link punterebbe alla radice del sito.
 */
export const router = createBrowserRouter(rotte, { basename: '/admin' });
