<!DOCTYPE html>
<html lang="it">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>KalTrack - Gestionale</title>
    {{--
        `@viteReactRefresh` PRIMA di `@vite`: inietta il runtime di Fast
        Refresh, che in `npm run dev` deve esistere prima che il modulo React
        venga valutato. In build di produzione e' un no-op. Fino alla Fase 2
        era assente di proposito, perche' `@vitejs/plugin-react` non era
        installato e lo script chiedeva un /@react-refresh che rispondeva 404.
    --}}
    @viteReactRefresh
    @vite(['resources/js/admin/main.tsx'])
</head>
<body>
    <div id="admin-root"></div>
</body>
</html>
