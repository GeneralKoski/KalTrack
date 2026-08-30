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
- **Confronto con piu' persone e confronto in palestra.** Piano scritto:
  [`docs/superpowers/plans/2026-08-30-confronto-multiplo-e-palestra.md`](docs/superpowers/plans/2026-08-30-confronto-multiplo-e-palestra.md).
- **Verifica email e recupero password.** Al loro posto c'e' il reimposta
  password dell'amministratore, in Impostazioni.

## Configurazione

Copiare `.env.example` in `.env`. Due variabili, entrambe facoltative: la
chiave Groq accende l'assistente vocale, `EXPO_PUBLIC_API_URL` accende account
e sincronizzazione. Senza nessuna delle due l'app funziona comunque, con meno
cose.
