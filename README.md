# KalTrack

App mobile personale per il tracking di alimentazione, peso, passi e
allenamento, con assistente vocale AI. React Native + Expo, local-first: i dati
vivono in SQLite sul telefono e l'app funziona senza rete.

Un account è **facoltativo**. Chi lo fa ottiene due cose: una copia dei propri
dati sul server (`backend/`), così un telefono rotto non porta via tutto e un
secondo dispositivo li ritrova, e la parte amici. Chi non lo fa non se ne
accorge: l'app resta quella di sempre.

## Avvio

```bash
npm install
npm run android   # oppure npm run ios
```

Serve un development build (`expo-dev-client`): Expo Go non basta, il progetto
usa moduli nativi.

## Comandi

```bash
npm start          # dev server
npm run typecheck  # TypeScript
npm run lint       # ESLint
npm test           # Jest
```

## Documentazione

- Design: [`docs/superpowers/specs/2026-08-28-kaltrack-design.md`](docs/superpowers/specs/2026-08-28-kaltrack-design.md)
- Piano Fase 1: [`docs/superpowers/plans/2026-08-28-kaltrack-fase-1-nutrizione.md`](docs/superpowers/plans/2026-08-28-kaltrack-fase-1-nutrizione.md)
- Convenzioni di sviluppo: [`CLAUDE.md`](CLAUDE.md)
- Stato del progetto e lavoro aperto: [`HANDOFF.md`](HANDOFF.md)
- Server, privacy e sincronizzazione: [`backend/README.md`](backend/README.md)

## Da fare

- **Passi su iOS (HealthKit).** L'interfaccia `HealthProvider` in
  `src/services/healthConnect.ts` e' il punto d'innesto; su iOS i passi non
  arrivano da soli. Rimandato di proposito.
- **Verifica email e recupero password.** Al loro posto c'e' il reimposta
  password dell'amministratore, in Impostazioni.
- **Moderazione dei cataloghi condivisi.** Alimenti ed esercizi sono comuni a
  tutti gli iscritti e ciascuno corregge solo le proprie voci: nessuno puo'
  togliere una riga altrui scritta male.
- **Un secondo ambiente.** Il backend e' uno solo, quindi le migrazioni
  debuttano in produzione. La scelta test/prod che `deploy.sh` propone non e'
  mai stata configurata.
- **Raccolta delle foto orfane.** Cancellando una foto dal telefono il file
  resta sul server per sempre.

Il resto dello stato aperto sta in [`HANDOFF.md`](HANDOFF.md).

## Configurazione

Copiare `.env.example` in `.env`. Due variabili: `EXPO_PUBLIC_GEMINI_API_KEY`
accende l'AI (assistente vocale, stima da foto, lettura etichette),
`EXPO_PUBLIC_API_URL` accende account e sincronizzazione. Entrambe facoltative:
senza nessuna delle due l'app funziona comunque, con meno cose.

La chiave finisce **nel bundle**, ed e' voluto - vedi [`CLAUDE.md`](CLAUDE.md)
§ AI. Per questo l'APK non si distribuisce.
