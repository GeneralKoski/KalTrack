# KalTrack

App mobile personale per il tracking di alimentazione, peso, passi e
allenamento, con assistente vocale AI. React Native + Expo, local-first: tutti i
dati vivono in SQLite sul telefono, senza backend e senza account.

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

## Configurazione

Copiare `.env.example` in `.env`. La chiave Groq serve solo dalla Fase 2.
