# Il canvas del ridisegno

Le schermate di KalTrack prima e dopo, una accanto all'altra.
Pubblicato su https://claude.ai/code/artifact/c69806de-44d0-4893-a7c4-92332abf384a

## Cosa c'e' dentro

- `*.dc.html` — un artboard ciascuno. Sono HTML statico: due `<img>` affiancate
  e un'etichetta, niente di piu'. Il confronto lo fanno le immagini.
- `canvas.json` — dove sta ogni artboard sulla tela e su quale pagina.
  Tre pagine: **Prima fase**, **Seconda fase**, **Due lingue**.
- `img/` — le fotografie delle schermate, JPEG a 700 px di lato lungo.
- `kaltrack-redesign.html` — la pagina pubblicata. **Gitignorata**: sono quattro
  megabyte che si rigenerano dai file qui sopra, e un binario che cambia per
  intero a ogni ritocco non ha niente da fare in un diff.

## Perche' le immagini stanno nel repository

Non ci sono state fino all'8 settembre 2026, e il canvas si poteva ricostruire
solo finche' esisteva la pagina pubblicata: gli originali erano in una cartella
temporanea, e recuperarli ha voluto dire estrarli dalla pagina stessa. Un
megabyte e mezzo e' il prezzo per non dipendere piu' da niente.

## Come si rigenera

Il canvas si semina con la skill Claude Design (`/design`), che porta il proprio
`seed-canvas.mjs` e il proprio `payload.template.html`. Il percorso della skill
cambia a ogni versione, quindi non si puo' scrivere qui dentro: si invoca la
skill e le si passano gli artboard, le immagini di `img/` e `canvas.json`.

## La regola del confronto

**Prima e dopo, senza commento.** Niente frecce, niente cerchietti, niente
didascalie che spiegano cosa guardare: due schermate affiancate e basta. Chi
guarda vede la differenza da se', e se non la vede la modifica non valeva.

Per la stessa ragione qui non ci sono piu' mockup. Ce n'erano cinque, disegnati
a mano accanto alla schermata vera, ed erano l'argomento per un lavoro non
ancora fatto: appena il lavoro e' stato fatto sono diventati la mia
interpretazione di una schermata accanto alla schermata stessa, che e' peggio
che inutile. Il "dopo" e' sempre una fotografia dell'app.

Le pagine sono due tipi di confronto diversi:

- **Prima fase** e **Seconda fase** confrontano com'era e com'e'.
- **Due lingue** confronta italiano e inglese, perche' li' non e' cambiata la
  forma di niente: la coppia che significa qualcosa e' quella delle lingue.
