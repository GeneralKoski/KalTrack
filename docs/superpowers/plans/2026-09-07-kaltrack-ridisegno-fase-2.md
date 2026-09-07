# Ridisegno KalTrack — fase 2

Piano di esecuzione. Le proposte sono sul canvas
(https://claude.ai/code/artifact/c69806de-44d0-4893-a7c4-92332abf384a,
pagina **Proposte**), i sorgenti in `design/`.

Questo documento esiste perché la conversazione viene compattata: deve bastare
da solo. Chi lo esegue non ha bisogno di ricordare niente della discussione.

## Dove siamo

Fatto e in `main` (commit `f085e35` → `f34c174`):

- i tre livelli di superficie (`HeroPanel`, `ListGroup`/`ListRow`, nudo) e la
  loro applicazione a Oggi, Progressi, Palestra, Profilo, Impostazioni,
  Attrezzatura, Pasti, Amici, Piano pasti, Traguardi, elenchi lunghi;
- `FieldLabel` distinto da `SectionLabel`, `EmptyState compact`;
- palestra: hero di avanzamento + cronometro nell'allenamento, intestazione di
  colonna in `SetRow`/`SetHeader`, selettore a segmenti nel `BlockEditor`;
- `WeekdayPicker`, tab bar tradotta, `useVoiceRecording` che non legge più il
  recorder rilasciato, deep link collegati.

Le regole di sistema stanno in `CLAUDE.md` § I tre livelli di superficie.
**Vanno lette prima di toccare qualunque cosa qui sotto.**

## 1. Storico peso e passi — il grafico che ho tolto e non ho rimesso

**Priorità alta: è una regressione, non un miglioramento mancato.**

Ridisegnando Progressi ho sostituito le tre sparkline a piena larghezza con
righe compatte, scrivendo nel commento che «il grafico esteso vive nello
storico». `WeightHistoryScreen` e `StepsHistoryScreen` **non hanno alcun
grafico** e non l'hanno mai avuto (`grep -n "Sparkline" src/navigation/screens/WeightHistoryScreen.tsx`
non trova niente). Quindi oggi il grafico grande non esiste più da nessuna
parte, e quel commento dice il falso.

Artboard: `design/StoricoPeso.dc.html`.

- `src/navigation/screens/WeightHistoryScreen.tsx` e `StepsHistoryScreen.tsx`:
  un `HeroPanel` in cima con il valore corrente, la variazione sulla finestra
  scelta e un grafico alto ~120. Sotto, l'elenco come `ListGroup`.
- Il selettore di finestra (30 giorni / 6 mesi / tutto) è un controllo a
  segmenti come quello del `BlockEditor` — non chip scorrevoli.
- Ogni riga porta il **delta col segno** rispetto alla misura precedente.
  Oggi la prima riga mostra la parola «prima» a destra del valore, dove si
  legge come l'etichetta del numero; sostituirla con «—».
- `Sparkline` accetta già `width`/`height`: qui serve un grafico con assi
  leggibili, valutare se estenderlo o scriverne uno accanto. **Non toccare
  `Sparkline` in modo da rompere il suo uso in riga su Progressi.**
- Correggere il commento in `ProgressScreen.tsx` che oggi promette il grafico
  nello storico: dopo questa modifica diventa vero, prima no.

## 2. Nuovo alimento — due «galleria» che significano cose diverse

Artboard: `design/NuovoAlimento.dc.html`.
File: `src/navigation/screens/FoodFormScreen.tsx`, `src/components/kal/PhotoField.tsx`,
`src/containers/foods/LabelScanner.tsx`.

- «Dalla galleria» compare **due volte a ~200 px di distanza** e significa due
  cose diverse: la foto del prodotto, e la foto dell'etichetta nutrizionale da
  leggere con l'OCR. E «Scansiona etich…» è troncato.
- La foto del prodotto diventa una tessera da 64 accanto al campo del nome,
  invece di due riquadri tratteggiati alti ~190 ciascuno per un'azione
  secondaria in un modulo dove il lavoro è digitare numeri.
- Lo scanner dell'etichetta diventa **una** azione a tutta larghezza
  («Scansiona l'etichetta») con la via della galleria come collegamento sotto:
  così le due «galleria» non stanno mai affiancate.
- I campi dei nutrienti restano in griglia a due colonne.

## 3. Genera scheda con IA — quattro select per quattro parole

Artboard: `design/GeneraScheda.dc.html`.
File: `src/navigation/screens/GenerateRoutineScreen.tsx`.

- Obiettivo, Livello, Giorni, Durata sono quattro valori corti su quattro
  select a tutta larghezza: il modulo finisce sotto la piega. In griglia 2×2
  ci sta tutto sopra.
- L'attrezzatura in sola lettura diventa un blocco con il collegamento
  «Modifica» in intestazione. Attenzione: `listAvailableEquipment()` è per
  eccezione (tutto disponibile tranne quel che si è tolto), quindi su un
  telefono nuovo la frase è «tutta» — vedi `CLAUDE.md` § L'attrezzatura.
- Le due azioni in fondo: «Genera scheda» primaria, «Annulla» come testo.

## 4. Lista della spesa — chip tagliati e nessuna separazione

Artboard: `design/ListaSpesa.dc.html`.
File: `src/navigation/screens/ShoppingListScreen.tsx`.

- I chip del periodo si tagliano a metà parola («Pross…»). Sono tre opzioni
  fisse: controllo a segmenti.
- Separare «da comprare» da «presi», che oggi la schermata non fa: le voci
  prese restano mescolate alle altre.
- Le righe in `ListGroup`, con il tondo di spunta a sinistra.

## 5. Primo avvio — sette passi per nove campi

Artboard: `design/Onboarding.dc.html`.
File: `src/navigation/onboardingStack.tsx`, `src/domain/onboarding.ts`,
`src/navigation/screens/Onboarding*.tsx`, `src/containers/onboarding/`.

**Da concordare prima di scrivere: tocca il flusso, non solo la grafica.**

- I passi 3, 4, 5 e 6 hanno da uno a tre campi ciascuno e il 70-80% di
  schermo vuoto. Proposta: quattro passi invece di sette — benvenuto+lingua,
  tutti i dati fisici insieme, aspetto, account.
- Lo spazio vuoto dei dati fisici lo riempie **la conseguenza**: un pannello
  che mostra il fabbisogno calcolato mentre si compila, così si capisce perché
  quei campi vengono chiesti.
- L'account passa in fondo: oggi è il passo 2, prima ancora di aver visto
  l'app, e la via più usata («Salta per ora») è il bottone più lontano.

Vincoli da non rompere (`CLAUDE.md` § Il primo avvio):

- `OnboardingLanguage` **resta il primo passo**: la schermata di benvenuto
  deve già uscire nella lingua giusta.
- `initialState` ricostruisce **tutta** la cronologia fino al passo salvato,
  o «Indietro» al primo passo dopo una ripresa non ha dove tornare.
- `saveProfile` è un upsert su riga unica: ogni passo rilegge l'intera riga e
  la riscrive, o il passo dopo azzera quel che il precedente aveva scritto.
- Cambiando il numero dei passi va aggiornato `OnboardingStep` in
  `src/domain/onboarding.ts` **e** considerato chi ha un `onboarding_step`
  salvato con un nome che non esiste più: `isOnboardingStep` già ricade sul
  primo passo, verificarlo con un test.

## 6. Difetti minori raccolti nel giro

- **`Data di nascita` parte da oggi** (`OnboardingProfileBasicsScreen`,
  `TargetsScreen`): l'età calcolata è zero finché non la si cambia, e il TDEE
  esce sbagliato senza dirlo. Serve un valore vuoto con segnaposto, o un
  default plausibile.
- **`onboarding_completed` si legge dalla presenza della chiave**, non dal
  valore (`src/stores/onboardingStore.ts`: `completedValue !== null`).
  Scrivere `"0"` da qualunque parte varrebbe «completato». Nessuno lo scrive
  oggi, ma è fragile: leggere il valore.
- **`kaltrack://assistente`** è descritto in `CLAUDE.md` § Dove vive il
  microfono come scorciatoia funzionante. I deep link ora funzionano, ma una
  rotta con quel nome **non esiste**: o si aggiunge, o si corregge il
  documento.
- La tab bar in `src/navigation/index.tsx` tiene ancora `title: i18n.t(...)`
  risolto al caricamento del modulo. Non si vede (l'etichetta la disegna
  `TabLabel`), ma resta una stringa congelata nella lingua di partenza: se
  qualcosa dovesse leggerla per l'accessibilità sarebbe sbagliata.

## Come si lavora

1. Una modifica per volta, nell'ordine qui sopra: 1 è una regressione, 2-4
   sono le proposte approvate, 5 va concordato, 6 sono rifiniture.
2. Prima di ogni schermata, rileggere la sezione pertinente di `CLAUDE.md`:
   quasi ogni scelta apparentemente arbitraria lì dentro è un difetto già
   pagato.
3. Cancelli: `npx tsc --noEmit`, `npx eslint src`, `npx jest`. Tutti e tre
   verdi prima di ogni commit.
4. Verifica a schermo sull'emulatore. I deep link ora funzionano:
   `adb shell am start -a android.intent.action.VIEW -d "kaltrack://<path>" com.koski.kaltrack`
   — i percorsi sono dichiarati schermata per schermata in
   `src/navigation/index.tsx`.
5. Per rivedere il primo avvio serve cancellare due righe dal database:

   ```bash
   adb shell am force-stop com.koski.kaltrack
   adb exec-out run-as com.koski.kaltrack cat files/SQLite/kaltrack.db > /tmp/kaltrack.db
   # più kaltrack.db-wal e kaltrack.db-shm: il grosso dei dati sta nel WAL
   python3 -c "
   import sqlite3
   c = sqlite3.connect('/tmp/kaltrack.db')
   c.execute(\"DELETE FROM settings WHERE key IN ('onboarding_completed','onboarding_step')\")
   c.commit(); c.execute('PRAGMA wal_checkpoint(TRUNCATE)')"
   adb push /tmp/kaltrack.db /data/local/tmp/kt.db && adb shell chmod 666 /data/local/tmp/kt.db
   adb shell run-as com.koski.kaltrack rm -f files/SQLite/kaltrack.db-wal
   adb shell run-as com.koski.kaltrack rm -f files/SQLite/kaltrack.db-shm
   adb shell run-as com.koski.kaltrack cp /data/local/tmp/kt.db files/SQLite/kaltrack.db
   ```

   Mettere `onboarding_completed` a `"0"` **non basta** (vedi § 6).
6. Aggiornare `CLAUDE.md` quando una modifica smentisce quel che c'è scritto.
   È già successo una volta in questo lavoro, ed è il motivo del punto 1.
