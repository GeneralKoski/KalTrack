# TODO

Quel che manca, in ordine di quanto blocca il resto. `HANDOFF.md` racconta lo
**stato** e come ci si e' arrivati; qui ci sono solo le **cose da fare**, con il
rimando a li' dove il contesto e' lungo.

Ultimo aggiornamento: 2 settembre 2026.

---

## 1. Bloccanti: niente di quel che segue si verifica senza questi

- [x] ~~**Deployare il backend.**~~ Fatto il 2 settembre 2026.
      `ImageController` (nome dei file, controllo del tipo) e `routes/api.php`
      (throttle sul reset password), nessuna migrazione - l'entrypoint ha detto
      "Nothing to migrate", che era la risposta attesa. Verificato dall'esterno:
      `/up` 200 in HTTPS, le rotte protette 401 e non 500,
      `ThrottleRequests:10,1` presente nelle rotte in cache. Backup pre-deploy
      `kaltrack-2026-09-02-090620.sqlite`.
- [x] ~~**Costruire la 1.0.4 e provarla sul telefono.**~~ Fatto il 3 settembre
      2026.
- [x] ~~**Cambiare la password di `GeneralKoski`.**~~ Fatto il 3 settembre 2026.
- [x] ~~**Copiare il keystore fuori da questo computer.**~~ Fatto il 3
      settembre 2026.

### Da vedere a schermo, con la 1.0.4 in mano

**Tutto visto funzionare sul telefono il 3 settembre 2026**, oltre al flusso
di primo avvio (sezione 2), mai passato da un emulatore.

- [x] ~~Lo scanner del codice a barre, con un prodotto vero.~~ I tre esiti
      diversi - prodotto gia' in libreria, prodotto in OpenFoodFacts, codice
      che nessuno dei due conosce.
- [x] ~~Il permesso della fotocamera, che viene chiesto per la prima volta.~~
- [x] ~~La ricerca dall'archivio in Alimenti.~~
- [x] ~~Due promemoria personalizzati.~~
- [x] ~~Le foto dei progressi su un secondo dispositivo.~~
- [x] ~~Il ridimensionamento, dal peso dei file in `documentDirectory/photos`.~~
- [x] ~~La trascrizione vocale su `gemini-3.5-flash-lite`.~~
- [x] ~~**La percentuale di cache in Impostazioni > Diagnostica.**~~ Letta con
      dati veri: **"non dichiarata"**, il caso previsto per
      `gemini-3.5-flash-lite` (vedi `CLAUDE.md` § Il prezzo del prompt
      dell'assistente) e non un difetto.

---

## 2. Il primo avvio

**Fatto il 3 settembre 2026.** Sei passi (`src/navigation/onboardingStack.tsx`,
schermate `Onboarding*Screen` in `src/navigation/screens/`): benvenuto con
accesso/registrazione o "Salta" di pari dignita', dati base (sesso/data
nascita/altezza), peso, attivita'/obiettivo, target giornalieri precompilati
da `suggestTargets` e modificabili, scelta del tema. Rilevazione del primo
avvio e ripresa dal passo esatto via `onboarding_step`/`onboarding_completed`
in `settings` (`src/stores/onboardingStore.ts`) - il primo locale, il secondo
sincronizzato, cosi' un secondo dispositivo sullo stesso account non lo
rifa'. `STORAGE_KEYS.FIRST_LAUNCH`, l'impalcatura morta che doveva servire a
questo, e' stata tolta invece di essere riusata.

---

## 3. Abbonamento e funzioni AI a pagamento

**Direzione decisa, non ipotesi.** L'app verra' rilasciata al pubblico e le
funzioni AI saranno a pagamento, con la chiave Gemini a consumo. Senza account
l'app resta usabile - la sezione 2 non cambia, **senza account si mangia** - ma
le funzioni AI chiedono la registrazione, con una modale che dice cosa si
ottiene registrandosi.

Non e' lavoro da fare adesso. Va scritto adesso perche' **una parte del codice
di oggi vale solo finche' l'app non si distribuisce**, e chi ci lavora deve
saperlo prima di appoggiarsi a quel presupposto.

### 3.1 La chiave deve uscire dal client: e' la precondizione

Oggi `EXPO_PUBLIC_GEMINI_API_KEY` sta in `.env` e quindi **dentro l'APK**.
`CLAUDE.md` lo dichiara come scelta, e la scelta e' valida per una ragione
sola, scritta accanto: **l'APK non si distribuisce**. Con il rilascio quella
condizione decade, e una chiave dentro un APK pubblico si estrae in pochi
minuti: chiunque la usa, e a consumo la usa **sul tuo conto**.

**Questo e' il primo lavoro del rilascio, non l'ultimo**: e' l'unica voce che
non si puo' rimandare a dopo la pubblicazione, perche' dopo la chiave e' gia'
fuori.

- [ ] **Spostare le chiamate AI dietro il backend.** Il server tiene la
      chiave, verifica il diritto dell'utente e poi chiama Gemini; l'app parla
      solo con il proprio backend. Oggi non esiste **nessuna** rotta AI in
      `backend/routes/api.php`: l'AI non ha mai toccato il server.
- [ ] **Una quota per utente sul proxy.** Senza, un solo account puo' bruciare
      il budget di tutti - ed e' il proprio budget, non quello di Google.
      `login` e `register` hanno gia' un throttle, il proxy ne vuole uno
      pensato sul costo e non sulle richieste.

**Il blocco nell'app e' un cartello, non una serratura.** Disattivare il
microfono lato client si aggira ripacchettizzando l'APK. L'unico punto dove il
diritto si controlla davvero e' il server, cioe' lo stesso posto dove ora deve
stare la chiave: sono lo stesso lavoro, non due.

### 3.2 Dove passa il confine fra gratis e premium

Qui c'e' un incastro che vale la pena vedere: **due voci della sezione 4 - nate
come risparmio - diventano la linea di prodotto.**

| | Gratis, senza account, **anche offline** | Premium |
|---|---|---|
| Scrivere a mano | si' | |
| Dettare "8000 passi", "peso 78 e mezzo" | si': trascrizione on-device (4.2) + percorso deterministico (4.3) | |
| Capire una frase qualunque coi tredici strumenti | | si' |
| Stima del pasto da foto | | si' |
| Lettura dell'etichetta | | si' (o on-device, vedi 4.4) |
| Piani, coach settimanale, alternative | | si' |

Cosi' il livello gratuito **e' ancora un'app utile**, ed e' quel che fa
registrare la gente invece di farla disinstallare: dettare i passi funziona
sempre, senza rete e senza account, e il modello serve quando la frase e' vera
lingua. Un gratuito che non fa niente non convince nessuno a pagare.

- [ ] **Decidere il confine prima di costruire la modale.** La riga da
      spostare e' la trascrizione: se resta su Gemini, ogni frase dettata e'
      premium e il gratuito perde la voce.
- [ ] **La modale al momento del tocco**, non all'avvio: chi tocca il
      microfono ha appena mostrato di volerlo. Deve dire **cosa si ottiene**,
      non cosa si perde, e non deve poter sbarrare il resto dell'app - vedi il
      vincolo della sezione 2.

### 3.3 Quel che manca e non e' scritto da nessuna parte

- [ ] **Nessun concetto di abbonamento sul server.** In `users` non c'e'
      niente: ne' piano, ne' scadenza, ne' prova gratuita (`grep plan|premium|
      subscription|trial` sulle migrazioni non trova nulla). Serve almeno lo
      stato dell'abbonamento, la data di scadenza e il consumo del periodo -
      quest'ultimo perche' la quota del § 3.1 deve poggiare su qualcosa.
- [ ] **Cosa succede quando l'abbonamento finisce.** E' la decisione di
      prodotto che si scopre tardi se non la si prende prima: i dati **restano
      del telefono** - fonte di verita', regola numero uno - quindi non si
      perde niente e l'app continua a funzionare. Si spengono le funzioni AI e
      basta. Va scritto prima di costruire la modale, altrimenti lo decide il
      codice per conto suo.
- [ ] **Nessuna fatturazione.** Su Google Play i beni digitali vanno venduti
      con Play Billing, salvo eccezioni: **da verificare sulla policy
      corrente** prima di scegliere fra Play Billing diretto e un intermediario
      tipo RevenueCat. Serve anche la verifica della ricevuta **lato server**,
      per la stessa ragione del § 3.1: un abbonamento validato dal telefono si
      falsifica dal telefono. E' la voce piu' lunga di tutte e non e' codice
      dell'app.
- [ ] **Prezzo e cosa comprende.** Non e' scritto da nessuna parte, e decide la
      riga della tabella qui sopra. Il conto del § 4 e' il punto di partenza,
      ma **quei numeri sono contati sui prezzi di `gemini-3.6-flash`**
      ($0,75/$3,75 per milione) e l'app usa flash-lite, che costa $0,30/$2,50 -
      input al 40%, output al 67%. Il conto scende di circa la meta', quindi
      **~$1-1,50 al mese di solo modello** per un utente attivo. E' una
      derivazione dai listini, non una misura: vale il § 4.1.
- [ ] **Le note legali che oggi non esistono.** Un'app a pagamento sullo store
      vuole informativa privacy e termini di servizio, e questa ne manda dati
      a un terzo (Google Gemini) di cui va detto. Nessuno dei due documenti
      esiste nel repository.
- [x] ~~La riga d'apertura di `CLAUDE.md` diventerebbe falsa~~ - fatto il 2
      settembre: § Cos'e' KalTrack dichiara ora lo stato di oggi e il rilascio
      in programma, e § AI dice che la chiave nel bundle ha una data di
      scadenza.

---

## 4. Spendere meno di AI

**Attenzione: questa sezione diceva il contrario, e la correzione ne cambia la
priorita'.** Ci stava scritto "1.500 richieste al giorno contro le ~70 di un uso
normale, quindi non e' un problema finche' l'app resta su un telefono solo".
Quel numero e' falso.

Il limite del Free Tier e'
`GenerateRequestsPerDayPerProjectPerModel-FreeTier`, un tetto giornaliero **per
modello**, e su `gemini-3.6-flash` vale **venti**. Misurato il 2 settembre 2026
leggendolo dal corpo di un 429: Google non lo pubblica, la pagina dei rate
limit rimanda ad AI Studio. `gemini-3.5-flash-lite`, che l'app usa oggi, ha un
tetto piu' alto - oltre 28 richieste in un giorno senza esaurirlo, valore
esatto non pubblicato - ed e' la ragione per cui e' stato scelto.

Con le ~70 richieste al giorno stimate qui sotto, **il tetto e' un problema
adesso, su un telefono solo**, non il giorno che si passa a consumo. E la cache
del 2 settembre non lo tocca: una richiesta cachata costa meno ma **conta come una
richiesta**.

Questo sposta le priorita' dentro la sezione. Il § 4.2 (trascrizione
on-device) e il § 4.3 (percorso deterministico) non sono piu' risparmio: sono
**le due voci che togliono richieste dal conto**, cioe' l'unica leva che agisce
sul limite vero. Il resto della sezione parla di costo per token, che conta dal
§ 3 in avanti - quando si paga - e non oggi.

Una leva in piu', che esiste perche' la quota e' **per modello**: puntare le
tre voci di `MODELS` a modelli diversi somma i budget invece di dividerli. Oggi
puntano tutte a flash-lite perche' il suo tetto basta.

Il conto stimato per venti frasi e dieci foto al giorno e' **~$0,20 al giorno**
prima della cache del 2 settembre, **~$0,075-0,11** dopo - **contato su
`gemini-3.6-flash`**. Su flash-lite, che l'app usa, l'input costa il 40% e
l'output il 67%: circa la meta'. Quanto valga la cache su flash-lite non si sa,
perche' quel modello non dichiara i token cachati (vedi § 1). Restano tre voci
grosse, e due si tolgono con **funzioni native del telefono** invece che con un
modello.

### 4.1 Misurare prima di ottimizzare

- [ ] **Guardare Diagnostica dopo una settimana d'uso vero** prima di scrivere
      una riga di quel che segue. Il contatore c'e' da oggi
      (`ai_calls.cached_tokens`, `aiUsage`), e le stime qui sotto sono stime.
      La regola di questo progetto vale anche per il prezzo: **un numero non
      misurato e' un'ipotesi**.

### 4.2 La trascrizione on-device (il guadagno piu' grosso)

- [ ] **Riconoscimento vocale nativo al posto della chiamata a Gemini.**
      Android ha `SpeechRecognizer`, iOS ha `SFSpeechRecognizer`; il ponte e'
      `expo-speech-recognition` (oggi in `package.json` c'e' solo
      `expo-speech`, che e' la voce in uscita, non l'ascolto).

      Toglie **venti richieste al giorno su settanta** e costa zero. Ma la
      ragione vera non e' il prezzo: **funziona senza rete**, e "in palestra il
      segnale non c'e'" e' una promessa gia' scritta in `CLAUDE.md`. Oggi
      l'assistente vocale e' l'unica parte dell'app che non la regge.

      Il costo: si perde il bias lessicale del `DOMAIN_PROMPT`
      (`src/ai/transcribe.ts`), che sta li' perche' senza di lui "bresaola"
      diventa "brasata" e "lat machine" diventa "la maschine". Quindi **a
      cascata**, non in sostituzione: nativo prima, Gemini quando il
      dispositivo non ha riconoscitore o non torna niente. Da provare con dieci
      frasi di dominio vere prima di decidere quale delle due vince.

### 4.3 Le frasi che non hanno bisogno di un modello

- [ ] **Un percorso deterministico davanti a `runAssistant`.** "8000 passi",
      "peso 78 e mezzo", "ieri 12000 passi" non sono comprensione, sono
      espressioni regolari: riconoscerle e costruire il `ToolIntent` a mano
      salta **l'intera chiamata**, non solo una parte del prompt.

      Il modello esiste gia' nel repository e funziona: `normalizeQuantities`
      (`src/ai/assistant.ts`) e tutto `resolveFood.ts`, che e' un matcher
      Levenshtein puro senza una riga di AI e regge il passaggio piu' delicato
      del flusso.

      **Solo l'inequivocabile**, e tutto il resto al modello: sbagliare qui
      scrive nel diario un dato falso in silenzio, che e' molto peggio di una
      chiamata pagata. Quanto valga dipende da che quota delle frasi vere sia
      di questo tipo, ed e' esattamente cio' che il punto 4.1 serve a sapere.

### 4.4 L'etichetta nutrizionale e' OCR, non vision

- [ ] **ML Kit on-device piu' un parser, al posto di `readNutritionLabel`.**
      Una tabella nutrizionale ha un formato fisso ("per 100 g", "Energia
      1.234 kJ / 295 kcal", "di cui zuccheri"): il testo lo estrae ML Kit sul
      telefono a costo zero, e il resto e' un parser in TypeScript con i suoi
      test.

      Il modello resta come rete di sicurezza quando il parser non riconosce la
      tabella. Guadagno minore degli altri due, ma e' la parte piu'
      **prevedibile** di tutto il flusso AI, cioe' quella che meno merita un
      modello.

### 4.5 Voci minori, elencate per non riaprirle ogni volta

- [ ] **Misurare `MAX_SIDE_PX` a 768 invece di 1024** (`estimateFromPhoto.ts`,
      `LABEL_MAX_SIDE_PX` in `readNutritionLabel.ts`). Gemini fattura le
      immagini a riquadri di 768 px, quindi un lato lungo di 1024 ne paga piu'
      di uno. **Da misurare, non da assumere**: se la stima peggiora non vale i
      pochi centesimi, perche' una stima sbagliata costa piu' di una chiamata.
- [ ] ~~Accorciare le description dei tool~~ **da non fare.** Stanno nel
      prefisso, dove costano un decimo, e tagliarle rischia di riportare il
      totale sotto i 4.096 token facendo pagare prezzo pieno a quel che resta.
      Vedi `CLAUDE.md` § Il prezzo del prompt dell'assistente.
- [ ] ~~`weeklyCoach` senza AI~~ **non ne vale la pena.** E' una chiamata a
      settimana, e i numeri li calcola gia' `src/domain/`: il modello scrive
      solo la prosa.
- [ ] **La stima da foto non e' cacheabile** e non c'e' niente da fare: il suo
      prefisso e' un prompt di 1.700 caratteri, mille token sotto la soglia.

### Cosa NON si scripta, per chiudere la domanda

La stima di un pasto da una foto (serve vision) e la comprensione di una frase
libera con tredici strumenti.

E **niente di tutto questo va in Python o PHP**: il telefono e' la fonte di
verita' e l'app deve funzionare senza rete, quindi uno script sul backend
Laravel vorrebbe dire mandare fuori i dati e perdere l'uso offline. Deve essere
TypeScript che gira sul dispositivo, come gia' fanno `normalizeQuantities` e
`resolveFood`.

---

## 5. Debiti tecnici

- [ ] **Nessuno cancella dal server le foto tolte dal telefono.**
      `storage/app/private/images` cresce e non scende. La raccolta degli
      orfani del 2 settembre (`collectOrphanPhotos`) copre il lato telefono; il
      lato server no.
- [ ] **Diciassette pacchetti fuori versione.** Undici `expo-*` e
      `react-native` 0.83.4 contro 0.83.10 sono patch, **da fare insieme alla
      prossima build nativa e non prima**: costringono a ricostruire. La coppia
      da guardare e' `jest` 30 con `jest-expo` 57 contro i ~29 e ~55 che l'SDK
      55 si aspetta: la suite gira, ma e' la stessa forma del guasto di
      `expo-blur` (un pacchetto per SDK 57 su un runtime 55).
- [ ] **Dieci file usano `expo-file-system/legacy`**, l'API deprecata: foto,
      backup, esportazioni CSV, log e trascrizione. Il giorno che sparisce si
      fermano tutti insieme.
- [ ] **Un secondo ambiente (test).** Il backend e' uno solo: la scelta
      test/prod che `deploy.sh` propone viene dal template Dieffetech e non e'
      mai stata configurata (`.env.test` e `.env.prod` non esistono). Le
      migrazioni vanno dritte in produzione. **Se i dati sul server iniziano a
      contare, e' il primo debito da pagare.**
- [ ] **`accessibilityLabel` sta in 13 file su 134**, e i tocchi sono quasi
      tutti a sola icona: TalkBack legge una schermata di pulsanti senza nome.
      Ultima priorita' per un'app personale, ma e' l'unica area senza
      copertura.
- [ ] **Il catalogo non ha moderazione.** Chiunque aggiunge voci all'elenco di
      tutti e ciascuno corregge solo le proprie: un amministratore non puo'
      togliere una voce altrui scritta male. Con un utente solo non e' un
      problema, con dieci lo diventa.

---

## 6. Decisioni aperte

- [ ] **La palla dell'assistente che si muove con la voce.** Il microfono
      virtuale dell'emulatore riporta `0.000` fisso anche con
      `-allow-host-audio`: il collegamento e' verificato, la reazione al volume
      no. Va vista sul telefono.
- [ ] **Provare il confronto con dati veri.** Sul server c'e' **un solo
      utente**, quindi non c'e' nessuno da mettere accanto. Serve un secondo
      account. Passa i test, ma la lezione del progetto e' che i difetti seri
      escono aprendo l'app.

---

## 7. Fuori scope per scelta

Non sono dimenticanze e non vanno riaperte senza una ragione nuova.

- **Passi su iOS (HealthKit).** L'innesto e' pronto: l'interfaccia
  `HealthProvider` in `src/services/healthConnect.ts`.
- **Verifica email e recupero password automatico.** Al loro posto c'e' il
  reimposta password dell'amministratore.
- **Classifiche fra piu' persone**, e un vincitore sul confronto delle calorie.
  Vedi la sezione 9.2 della spec: mangiare piu' o meno di un'altra persona non
  e' meglio ne' peggio, e una spunta sarebbe un consiglio sbagliato.
- **Una seconda lingua.** La struttura i18n regge, servono tre modifiche
  elencate in `CLAUDE.md` § Lingua. L'app e' personale.
- **Il target web.** Niente `react-native-web`, ed e' il motivo per cui
  `expo-doctor` resta a 18 su 20 di proposito.
- **Il microfono in palestra, e con lui l'inserimento vocale delle serie.**
  Deciso il 3 settembre 2026: l'AI in palestra resta solo `create_routine`
  (generazione scheda su richiesta, gia' com'e' oggi da `GenerateRoutineScreen`).
  `AssistantButton` resta su Oggi. `create_exercise` e `log_workout` restano
  nel registro degli strumenti ma non diventano un percorso da costruire.
