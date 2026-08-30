# Handoff - 30 agosto 2026

Punto della situazione per riprendere lo sviluppo da una sessione nuova. Non
sostituisce `CLAUDE.md`, che resta il documento delle convenzioni: qui c'e' lo
**stato**, non le regole.

## In una riga

L'app e' completa e in uso (Fasi 1-5). C'e' un backend Laravel in produzione con
sincronizzazione, amici e foto. Il lavoro aperto e' uno solo, e ha gia' un piano
scritto.

## Stato

| | |
|---|---|
| Test app | 797 su 50 suite |
| Test backend | 68 |
| Typecheck / lint | puliti, 0 errori |
| Ramo | `main`, allineato con `origin` |
| Server | `kaltrack.martin-trajkovski.it`, healthy, ultimo deploy allineato al codice |

## Cosa gira dove

- **App**: React Native + Expo, development build. `npm start` per metro,
  `npx expo run:android` per ricostruire il nativo. L'emulatore usato e'
  `Medium_Phone_API_36.1`.
- **Backend**: Docker su `188.245.201.81`, cartella `/srv/apps/KalTrack`,
  container `kaltrack-api`, dietro l'nginx del server con certificato.
  Procedura di deploy in `backend/README.md` § In produzione.
- **Database**: SQLite in WAL su un volume Docker montato in `/data`. Backup
  ogni notte alle 3:30 in `/srv/backups/kaltrack`, ne tiene quattordici.

## Account

Sul server c'e' **un solo utente**: `GeneralKoski`
(`mtrajkovski1@outlook.com`), amministratore. La password non e' scritta qui: se
serve, si reimposta da Impostazioni > Reimposta password, oppure con
`php artisan tinker` sul server assegnando `$u->password = '...'` (il cast
`hashed` fa l'hash da solo - **non** scrivere un hash a mano nella colonna).

## L'unico lavoro aperto

**Confronto con piu' persone e confronto in palestra.**
Piano completo: `docs/superpowers/plans/2026-08-30-confronto-multiplo-e-palestra.md`.

Da leggere prima di iniziare, perche' la decisione difficile non e' tecnica:
confrontare il volume in palestra significa **pubblicare quali esercizi si fanno
e con che carico**. Oggi al server arrivano quattro numeri di giornata e
"allenamenti" e' un conteggio, non un contenuto. Quella funzione cambia la
promessa dell'app, quindi il primo task del piano e' l'interruttore dedicato,
spento di serie.

## Rimandato di proposito

- **Passi su iOS (HealthKit).** L'innesto e' l'interfaccia `HealthProvider` in
  `src/services/healthConnect.ts`.
- **Verifica email e recupero password automatico.** Al loro posto c'e' il
  reimposta password dell'amministratore.
- **Classifiche fra piu' persone**, e il confronto sulle calorie con un
  vincitore. Fuori scope per scelta, non per mancanza di tempo: vedi la sezione
  9.2 della spec.

## Quel che serve sapere e non si deduce dal codice

1. **Il telefono e' la fonte di verita'.** Il server tiene una copia. L'app
   funziona senza rete e senza account, e va tenuta cosi'.
2. **La chiave Groq la porta l'utente**, sta in SecureStore e non e' nel bundle.
   Senza, le funzioni AI sono spente e non e' un difetto.
3. **Non salvare mai niente di segreto in `settings`**: e' una tabella
   sincronizzata, finirebbe sul server in chiaro.
4. **Mai `DELETE FROM` su una tabella sincronizzata.** Le quattro regole della
   sincronizzazione sono in `CLAUDE.md`, ognuna e' costata un difetto.
5. Le regole del confronto (`src/domain/comparison.ts`) sono decisioni di
   prodotto con test propri, non logica da rifattorizzare.

## Come si verifica una modifica

Il gate e' `npm run typecheck && npm run lint && npm test`, piu'
`php artisan test` nel backend. Ma la lezione di questi due giorni e' un'altra:
**quasi tutti i difetti seri sono usciti aprendo l'app o interrogando il server
vero, non dai test.** Le calorie a zero invece del trattino, la ricerca che non
era stata deployata, le foto rotte sul secondo dispositivo: nessuno di questi
sarebbe emerso da una suite verde.

Screenshot con `adb exec-out screencap -p > /tmp/x.png`, log con
`adb logcat -d -s ReactNativeJS:V`.
