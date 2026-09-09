<!DOCTYPE html>
<html lang="it">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>KalTrack - Gestionale</title>
    {{--
        A scorrere e' il contenuto, non il documento - ed e' il rimedio a uno
        sfarfallio in cima a ogni apertura di modulo.

        Ant Design, quando apre un drawer o una modale, blocca lo scorrimento
        del body (`ScrollLocker` di @rc-component/util). Quel che scrive non e'
        un padding: e' `overflow: hidden` PIU' `width: calc(100% - Npx)`, dove
        N e' la larghezza della barra misurata da `getScrollBarSize()`. La
        sottrazione dovrebbe compensare la barra che sparisce, ma `overflow:
        hidden` sul BODY non toglie la barra del documento - quella la governa
        l'elemento radice - quindi non c'e' niente da compensare e il body si
        stringe di N px per nulla. Ad ogni apertura e ad ogni chiusura, cioe'
        uno scarto avanti e indietro.

        N e' zero con le barre a sovrapposizione (il default di macOS) e ~15
        con "Mostra sempre le barre di scorrimento", o su Windows: il difetto
        si vede o non si vede a seconda di un'impostazione di sistema, ed e'
        il motivo per cui non si riproduce su ogni macchina.

        Il rimedio non e' `scrollbar-gutter: stable`, che era la prima idea:
        quello riserva lo spazio ma lascia `getScrollBarSize()` a 15, quindi
        la larghezza verrebbe scritta comunque - lo scarto cambierebbe verso,
        non spariva. Qui invece il documento non scorre affatto, e allora il
        lock trova `getComputedStyle(body).overflow === 'hidden'` e lascia
        `scrollBarSize` a zero: nessuna larghezza scritta, nessuno scarto.
        E' la stessa riga che rende innocuo il blocco e che gli impedisce di
        misurare qualcosa.

        Ne segue anche che intestazione e menu restano fermi mentre scorre
        l'elenco, che in un pannello e' quel che si vuole comunque.

        `#admin-root` ha bisogno dell'altezza come gli altri due: il `Layout`
        di `AdminLayout` la chiede al genitore, e su un genitore alto zero un
        `height: 100%` vale zero.
    --}}
    <style>
        html, body, #admin-root { height: 100%; }
        body { margin: 0; overflow: hidden; }
    </style>
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
