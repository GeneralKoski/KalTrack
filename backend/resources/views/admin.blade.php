<!DOCTYPE html>
<html lang="it">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>KalTrack - Gestionale</title>
    {{--
        Niente @viteReactRefresh: serve @vitejs/plugin-react, che non e'
        installato ne' configurato in vite.config.js. Senza il plugin e' un
        no-op in build di produzione, ma in `npm run dev` inietta uno script
        che chiede /@react-refresh e prende un 404 - rompe il dev server per
        una feature che qui non esiste. La Fase 2 lo riaggiunge insieme al
        plugin, quando arriva il pannello React vero.
    --}}
    @vite(['resources/js/admin/main.tsx'])
</head>
<body>
    <div id="admin-root"></div>
</body>
</html>
