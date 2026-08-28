# KalTrack Fase 1 - Nutrizione manuale - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un'app KalTrack installabile e usabile ogni giorno per tracciare pasti, alimenti, ricette, obiettivi calorici, peso e passi, interamente offline e senza AI.

**Architecture:** React Native + Expo local-first. SQLite dietro un'interfaccia `LocalDatabase` che astrae il driver, migrazioni numerate su `PRAGMA user_version`, query tipizzate per dominio. La logica di calcolo (nutrienti, TDEE, aggregazioni) vive in `src/domain/` come funzioni pure coperte da test unitari che girano su Node con better-sqlite3 al posto di expo-sqlite. Le schermate leggono i dati al focus tramite `useFocusData` e non contengono SQL.

**Tech Stack:** React Native 0.83, Expo 55, React 19 (React Compiler attivo), TypeScript strict, expo-sqlite, Zustand, React Navigation 7 static API, react-hook-form, StyleSheet + token da `src/styles.ts`, jest-expo, better-sqlite3 (solo test).

**Spec:** `docs/superpowers/specs/2026-08-28-kaltrack-design.md`

## Global Constraints

Valgono le guide Dieffetech `docs/react-native/` (`core.md`, `guidelines.md`). Ogni task le rispetta implicitamente.

- **Touchable**: `TouchableOpacity` con `activeOpacity={0.6}`. Mai `Pressable` con style-as-function (NativeWind v4 non applica lo style-funzione: il tap resta senza feedback). `hitSlop={8}` minimo sui target piccoli.
- **Styling**: token statici da `@/src/styles` (`theme.colors.*`, `theme.spacing.*`, `theme.radius.*`). Mai hex o numeri magici inline. `StyleSheet.create()` come approccio primario.
- **Colori semantici** (`background`, `surface`, `border`, `text`, `textMuted`) solo via `useAppTheme()`, mai dentro `StyleSheet.create()`.
- **Safe area**: tutto ciò che è assoluto, flottante o overlay usa `useSafeAreaInsets()`. Mai offset fissi.
- **Componenti**: sempre `Text` e `TextInput` da `@/src/components/ui`, mai le primitive RN nude (perdono il font Poppins).
- **i18n**: ogni testo visibile via `t("chiave")`. Chiavi aggiunte in **entrambi** `src/i18n/locales/it.json` e `en.json`.
- **Animazioni**: `react-native-reanimated`. Il plugin babel resta l'ultimo in `babel.config.js`.
- **Import**: alias `@/`, mai `../../`.
- **TypeScript**: `strict: true`, mai `any`.
- **Logging**: solo `logger` da `@/src/utils/logger`, mai `console.*`.
- **No target web**: nessun branch `Platform.OS === "web"`, nessuna dipendenza web.
- **Estrazione componenti**: feature-specific in `src/containers/<feature>/`, solo se davvero generico e presentazionale in `src/components/`.

### Gate di fine task (identico per ogni task)

Nessun task è chiuso finché tutti e cinque non passano:

1. `npm run typecheck` - zero errori
2. `npm run lint` - zero errori
3. `npm test` - tutti verdi
4. L'app si avvia sull'emulatore senza crash né errori rossi
5. Screenshot catturato e confrontato con quanto atteso (dal Task 4 in poi, quando c'è UI)

Poi commit. Messaggio in inglese, corpo esaustivo, nessun trailer.

### Comandi ricorrenti

```bash
# avvio emulatore (una volta per sessione)
~/Library/Android/sdk/emulator/emulator -avd Medium_Phone_API_36.1 -no-snapshot-load &

# build e installazione sul device/emulatore
npm run android

# screenshot
adb exec-out screencap -p > /tmp/kaltrack-<nome>.png

# log runtime (errori JS)
adb logcat -d -s ReactNativeJS:V | tail -50
```

---

## File Structure

**Layer DB** (`src/db/`)
- `sqliteAdapter.ts` - interfaccia `LocalDatabase` e wrapper su expo-sqlite. Unico punto che conosce il driver.
- `index.ts` - singleton `getDb()`, PRAGMA di connessione, `initDatabase()`.
- `ids.ts` - `newId()`, `nowIso()`.
- `migrations/index.ts` - runner su `PRAGMA user_version` e registro delle migrazioni.
- `migrations/001_initial.ts` - schema completo Fase 1.
- `migrations/002_seed_meal_types.ts` - tipi di pasto di default.
- `queries/nutrition.ts` - alimenti, ricette, pasti, righe.
- `queries/tracking.ts` - peso, passi.
- `queries/settings.ts` - profilo, obiettivi, impostazioni.
- `seed/foods.ts` - seed alimenti (dati).
- `seed/index.ts` - applicazione idempotente dei seed.
- `__testing__/betterSqliteAdapter.ts` - implementazione di `LocalDatabase` su better-sqlite3, solo per i test.

**Logica pura** (`src/domain/`)
- `nutrition.ts` - tipo `Nutrients`, scala, somma, totali ricetta.
- `targets.ts` - BMR, TDEE, obiettivi suggeriti.
- `date.ts` - date ISO, offset, settimane.
- I rispettivi `*.test.ts` accanto.

**UI condivisa** (`src/components/kal/`) - portata da Omnia Marine, adattata.

**Feature** (`src/containers/<feature>/`) - `diary/`, `foods/`, `recipes/`, `profile/`, `tracking/`.

**Schermate** (`src/navigation/screens/`) - una per rotta.

---

## Task 1: Setup del progetto

**Files:**
- Create: l'intero albero copiato da `~/Desktop/Dieffetech/react-native-expo-template`
- Modify: `package.json`, `app.json`, `src/consts.ts`, `src/App.tsx`, `src/navigation/index.tsx`, `jest.config.js`, `.env.example`, `CLAUDE.md`, `README.md`
- Delete: `src/stores/authStore.ts`, `src/stores/userStore.ts`, `src/hooks/useLogout.ts`, `src/hooks/useUser.ts`, `src/hooks/useApi.ts`, `src/hooks/useGetItem.ts`, `src/api/client.ts`, `src/components/form/DfApiSelect.tsx`, `src/components/DfTabView.tsx`, `src/navigation/screens/LoginScreen.tsx`, `src/navigation/screens/DetailScreen.tsx`, `src/types/user.ts`

**Interfaces:**
- Consumes: niente (primo task)
- Produces: progetto che compila e si avvia; alias `@/`; `npm run typecheck`, `npm run lint`, `npm test` funzionanti

- [ ] **Step 1: Copiare il template**

```bash
cd /Users/martintrajkovski/Desktop/Progetti-personali/KalTrack
rsync -a --exclude '.git' --exclude 'node_modules' --exclude '.expo' \
  ~/Desktop/Dieffetech/react-native-expo-template/ ./
```

- [ ] **Step 2: Rimuovere i file di auth, backend e demo**

```bash
rm -f src/stores/authStore.ts src/stores/userStore.ts \
      src/hooks/useLogout.ts src/hooks/useUser.ts src/hooks/useApi.ts src/hooks/useGetItem.ts \
      src/components/form/DfApiSelect.tsx src/components/DfTabView.tsx \
      src/navigation/screens/LoginScreen.tsx src/navigation/screens/DetailScreen.tsx \
      src/types/user.ts
rm -rf src/api
```

Aggiornare `src/stores/index.ts` e `src/types/index.ts` togliendo i re-export dei file rimossi.

- [ ] **Step 3: Riscrivere `src/App.tsx` senza auth**

Il gating d'avvio ora dipende solo da font e DB, non più da auth e utente. L'ordine dei provider resta quello della guida: `GestureHandlerRootView` → `GluestackUIProvider` → `SafeAreaProvider` → `ThemeProvider` → `BottomSheetModalProvider`.

```tsx
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import React, { useEffect, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import Toast from "react-native-toast-message";

import { GluestackUIProvider } from "@/components/ui/gluestack-ui-provider";
import "@/global.css";
import { ThemeProvider } from "@/src/components/ThemeContext";
import { Navigation } from "@/src/navigation";
import { logger } from "@/src/utils/logger";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";

export function App() {
  const [dbReady, setDbReady] = useState(false);

  const [fontsLoaded] = useFonts({
    "Poppins-Light": require("@/assets/fonts/Poppins-Light.ttf"),
    "Poppins-LightItalic": require("@/assets/fonts/Poppins-LightItalic.ttf"),
    "Poppins-Regular": require("@/assets/fonts/Poppins-Regular.ttf"),
    "Poppins-Italic": require("@/assets/fonts/Poppins-Italic.ttf"),
    "Poppins-Medium": require("@/assets/fonts/Poppins-Medium.ttf"),
    "Poppins-MediumItalic": require("@/assets/fonts/Poppins-MediumItalic.ttf"),
    "Poppins-SemiBold": require("@/assets/fonts/Poppins-SemiBold.ttf"),
    "Poppins-SemiBoldItalic": require("@/assets/fonts/Poppins-SemiBoldItalic.ttf"),
    "Poppins-Bold": require("@/assets/fonts/Poppins-Bold.ttf"),
    "Poppins-BoldItalic": require("@/assets/fonts/Poppins-BoldItalic.ttf"),
  });

  // Il DB viene inizializzato in Task 2; qui il gate esiste già così l'avvio
  // non cambia forma quando arriva.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        if (active) setDbReady(true);
      } catch (error) {
        logger.error("[app] inizializzazione fallita", error);
        if (active) setDbReady(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (fontsLoaded && dbReady) SplashScreen.hideAsync();
  }, [fontsLoaded, dbReady]);

  if (!fontsLoaded || !dbReady) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <GluestackUIProvider>
        <StatusBar style="dark" />
        <SafeAreaProvider>
          <ThemeProvider>
            <BottomSheetModalProvider>
              <Navigation />
              <Toast />
            </BottomSheetModalProvider>
          </ThemeProvider>
        </SafeAreaProvider>
      </GluestackUIProvider>
    </GestureHandlerRootView>
  );
}
```

Nota: `NavigationWrapper.tsx` conteneva l'auth guard e va sostituito dall'uso diretto di `Navigation`. Cancellarlo. Il `ValueEnumProvider` resta rimosso in questa fase: verrà reintrodotto solo se servirà davvero.

- [ ] **Step 4: Ridurre la navigazione a un tab singolo temporaneo**

In `src/navigation/index.tsx`: togliere `Login` e `Detail` dal RootStack, lasciare solo `Tabs` con la sola `Home` che punta a `HomeScreen`. Svuotare `HomeScreen` lasciando un `<Text>KalTrack</Text>` centrato. I 4 tab definitivi arrivano nel Task 4.

- [ ] **Step 5: Ripulire `src/consts.ts`**

```ts
export const DB_NAME = "kaltrack.db";

export const STORAGE_KEYS = {
  FIRST_LAUNCH: "first_launch",
} as const;
```

- [ ] **Step 6: Aggiornare `app.json`**

Sostituire nome, slug, scheme e identificativi:

```json
"name": "KalTrack",
"slug": "kaltrack",
"scheme": "kaltrack",
"ios": { "bundleIdentifier": "com.koski.kaltrack", "buildNumber": "1" },
"android": { "package": "com.koski.kaltrack", "versionCode": 1 }
```

Rimuovere il blocco `"web"`. Lasciare invariati i plugin esistenti.

- [ ] **Step 7: Rimuovere le dipendenze inutili e aggiungere quelle nuove**

```bash
npm uninstall react-native-web expo-router expo-web-browser expo-glass-effect expo-symbols
npx expo install expo-sqlite expo-crypto expo-file-system expo-network expo-linear-gradient expo-sharing expo-haptics
npm install --save-dev better-sqlite3 @types/better-sqlite3 jest jest-expo @types/jest
```

In `package.json` togliere gli script `web` e `build:web`, aggiungere `"test": "jest"`.

Le dipendenze delle fasi successive (`expo-audio`, `expo-speech`, `expo-camera`, `expo-image-picker`, `expo-image-manipulator`) **non** vanno installate ora: si aggiungono nella fase che le usa.

- [ ] **Step 8: Creare `jest.config.js`**

```js
/** @type {import('jest').Config} */
module.exports = {
  preset: "jest-expo",
  testEnvironment: "node",
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
  },
  transformIgnorePatterns: [
    "node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg))",
  ],
  testMatch: ["<rootDir>/src/**/*.test.ts", "<rootDir>/src/**/*.test.tsx"],
};
```

Se `better-sqlite3` non si carica sotto il preset jest-expo, il fallback è aggiungere un secondo progetto jest con `preset` assente e `testEnvironment: "node"` limitato a `src/db/**` e `src/domain/**`.

- [ ] **Step 9: Scrivere un test di sanità**

`src/utils/utils.test.ts`:

```ts
import { theme } from "@/src/styles";

describe("setup", () => {
  it("risolve l'alias @/ e carica i token del tema", () => {
    expect(theme.spacing.md).toBe(16);
    expect(theme.colors.white).toBe("#ffffff");
  });
});
```

- [ ] **Step 10: Eseguire il gate**

```bash
npm run typecheck && npm run lint && npm test
```

Atteso: tutti verdi. Se `lint` segnala import inutilizzati nei file toccati, rimuoverli.

- [ ] **Step 11: Avviare l'app sull'emulatore**

```bash
~/Library/Android/sdk/emulator/emulator -avd Medium_Phone_API_36.1 -no-snapshot-load &
# attendere che `adb devices` mostri il device come "device"
npm run android
```

Atteso: la app si installa e mostra la scritta KalTrack. Verificare l'assenza di errori con `adb logcat -d -s ReactNativeJS:V | tail -50`.

- [ ] **Step 12: Screenshot**

```bash
adb exec-out screencap -p > /tmp/kaltrack-task1.png
```

Aprire l'immagine e verificare: schermata bianca con il testo centrato, nessuna red box.

- [ ] **Step 13: Aggiornare `.env.example` e `CLAUDE.md`**

`.env.example`: rimuovere `EXPO_PUBLIC_API_URL`, aggiungere `EXPO_PUBLIC_GROQ_API_KEY=` con un commento che spiega che la chiave finisce nel bundle e che l'APK non va distribuito.

`CLAUDE.md`: sostituire le sezioni Authentication e Navigation con la descrizione local-first, e sostituire il nome del progetto. Rimuovere i riferimenti al target web.

- [ ] **Step 14: Commit**

```bash
git add -A
git commit -m "Set up KalTrack from the Dieffetech Expo template

Copies react-native-expo-template as the project base and strips
everything the local-first design does not need.

Removed: auth stores, login screen, axios API client with Bearer/refresh
interceptors, the useApi/useGetItem data hooks, DfApiSelect, the demo
Detail/Profile screens and the web target (react-native-web, react-dom,
the web scripts and the app.json web block), per the Dieffetech RN guide
which forbids a web target on mobile-only projects. Also dropped
expo-router, expo-web-browser, expo-glass-effect and expo-symbols, none
of which the template actually imports.

Added: expo-sqlite, expo-crypto, expo-file-system, expo-network,
expo-linear-gradient, expo-sharing and expo-haptics for the local-first
data layer, plus jest-expo and better-sqlite3 so the DB and domain
layers can be unit tested on Node.

App identity switched to KalTrack (slug, scheme, bundle id and Android
package). App.tsx now gates startup on fonts and the database instead of
auth, keeping the provider order required by the guide."
```

---

## Task 2: Layer database

**Files:**
- Create: `src/db/sqliteAdapter.ts`, `src/db/ids.ts`, `src/db/index.ts`, `src/db/migrations/index.ts`, `src/db/migrations/001_initial.ts`, `src/db/migrations/002_meal_types.ts`, `src/db/__testing__/betterSqliteAdapter.ts`, `src/db/migrations/migrations.test.ts`
- Modify: `src/App.tsx` (agganciare `initDatabase()` al gate d'avvio)

**Interfaces:**
- Consumes: `DB_NAME` da `@/src/consts`
- Produces:
  - `LocalDatabase` con `execAsync(sql)`, `getAllAsync<T>(sql, params?)`, `getFirstAsync<T>(sql, params?)`, `runAsync(sql, params?)`, `withTransactionAsync(fn)`, `closeAsync()`
  - `getDb(): Promise<LocalDatabase>`
  - `initDatabase(): Promise<void>`
  - `runMigrations(db: LocalDatabase): Promise<number>` che ritorna la versione finale
  - `newId(): string`, `nowIso(): string`
  - `createTestDb(): LocalDatabase` (solo test)

- [ ] **Step 1: Scrivere l'adapter di test (serve prima del test)**

`src/db/__testing__/betterSqliteAdapter.ts`. Non deve mai essere importato dal codice applicativo: esiste solo per far girare le migrazioni e le query reali su Node.

```ts
import Database from "better-sqlite3";

import type { BindValue, LocalDatabase } from "@/src/db/sqliteAdapter";

/** DB in memoria con la stessa superficie di LocalDatabase, per i test su Node. */
export function createTestDb(): LocalDatabase {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");

  return {
    execAsync: async (sql) => {
      db.exec(sql);
    },
    getAllAsync: async <T>(sql: string, params: BindValue[] = []) =>
      db.prepare(sql).all(...params) as T[],
    getFirstAsync: async <T>(sql: string, params: BindValue[] = []) =>
      (db.prepare(sql).get(...params) as T) ?? null,
    runAsync: async (sql, params = []) => {
      const info = db.prepare(sql).run(...params);
      return {
        lastInsertRowId: Number(info.lastInsertRowid),
        changes: info.changes,
      };
    },
    withTransactionAsync: async (fn) => {
      db.exec("BEGIN");
      try {
        await fn();
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
    closeAsync: async () => {
      db.close();
    },
  };
}
```

- [ ] **Step 2: Scrivere il test delle migrazioni (fallisce)**

`src/db/migrations/migrations.test.ts`:

```ts
import { createTestDb } from "@/src/db/__testing__/betterSqliteAdapter";
import { MIGRATIONS, runMigrations } from "@/src/db/migrations";
import type { LocalDatabase } from "@/src/db/sqliteAdapter";

const userVersion = async (db: LocalDatabase): Promise<number> => {
  const row = await db.getFirstAsync<{ user_version: number }>(
    "PRAGMA user_version",
  );
  return row?.user_version ?? 0;
};

const tableNames = async (db: LocalDatabase): Promise<string[]> => {
  const rows = await db.getAllAsync<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
  );
  return rows.map((r) => r.name);
};

describe("runMigrations", () => {
  it("porta un DB vuoto all'ultima versione", async () => {
    const db = createTestDb();
    const version = await runMigrations(db);

    expect(version).toBe(MIGRATIONS[MIGRATIONS.length - 1].version);
    expect(await userVersion(db)).toBe(version);
  });

  it("crea tutte le tabelle della Fase 1", async () => {
    const db = createTestDb();
    await runMigrations(db);

    const tables = await tableNames(db);
    for (const expected of [
      "foods",
      "recipes",
      "recipe_items",
      "meal_types",
      "meals",
      "meal_entries",
      "profile",
      "targets",
      "weight_logs",
      "step_logs",
      "settings",
    ]) {
      expect(tables).toContain(expected);
    }
  });

  it("è idempotente: rieseguirla non cambia nulla", async () => {
    const db = createTestDb();
    const first = await runMigrations(db);
    const second = await runMigrations(db);

    expect(second).toBe(first);
  });

  it("applica solo le migrazioni mancanti", async () => {
    const db = createTestDb();
    await db.execAsync(`PRAGMA user_version = ${MIGRATIONS[0].version}`);

    // La prima migrazione risulta già applicata: le tabelle non esistono ma il
    // runner non deve ricrearle, quindi la 002 fallirebbe se le presupponesse.
    // Verifica che il runner parta dalla versione dichiarata e non da zero.
    await expect(runMigrations(db)).rejects.toThrow();
  });

  it("i tipi di pasto di default sono presenti una sola volta", async () => {
    const db = createTestDb();
    await runMigrations(db);

    const rows = await db.getAllAsync<{ name: string }>(
      "SELECT name FROM meal_types WHERE deleted_at IS NULL ORDER BY sort",
    );
    expect(rows.map((r) => r.name)).toEqual([
      "colazione",
      "brunch",
      "pranzo",
      "snack",
      "cena",
    ]);
  });
});
```

- [ ] **Step 3: Eseguire il test per vederlo fallire**

Run: `npx jest src/db/migrations/migrations.test.ts`
Atteso: FAIL, `Cannot find module '@/src/db/migrations'`.

- [ ] **Step 4: Scrivere `src/db/sqliteAdapter.ts`**

```ts
import type { SQLiteBindValue, SQLiteDatabase } from "expo-sqlite";

export type BindValue = SQLiteBindValue;

export interface RunResult {
  lastInsertRowId: number;
  changes: number;
}

/**
 * Superficie minima del database locale. Astrae il driver: l'app usa
 * expo-sqlite, i test usano better-sqlite3 (vedi __testing__/). Cambiare driver
 * (es. op-sqlite con SQLCipher) tocca solo questo file.
 */
export interface LocalDatabase {
  /** Esegue uno o più statement separati da ";" senza parametri (DDL/PRAGMA). */
  execAsync(sql: string): Promise<void>;
  getAllAsync<T>(sql: string, params?: BindValue[]): Promise<T[]>;
  getFirstAsync<T>(sql: string, params?: BindValue[]): Promise<T | null>;
  runAsync(sql: string, params?: BindValue[]): Promise<RunResult>;
  withTransactionAsync(fn: () => Promise<void>): Promise<void>;
  closeAsync(): Promise<void>;
}

export function wrapDatabase(db: SQLiteDatabase): LocalDatabase {
  return {
    execAsync: (sql) => db.execAsync(sql),
    getAllAsync: <T>(sql: string, params: BindValue[] = []) =>
      db.getAllAsync<T>(sql, params),
    getFirstAsync: <T>(sql: string, params: BindValue[] = []) =>
      db.getFirstAsync<T>(sql, params),
    runAsync: async (sql, params = []) => {
      const result = await db.runAsync(sql, params);
      return {
        lastInsertRowId: result.lastInsertRowId,
        changes: result.changes,
      };
    },
    withTransactionAsync: (fn) => db.withTransactionAsync(fn),
    closeAsync: () => db.closeAsync(),
  };
}
```

- [ ] **Step 5: Scrivere `src/db/migrations/001_initial.ts`**

Tutte le tabelle hanno `id TEXT PRIMARY KEY`, `created_at`, `updated_at`, `deleted_at` per essere sync-ready. `deleted_at IS NULL` è la condizione di riga viva: ogni query lo filtra.

```ts
import type { Migration } from "@/src/db/migrations/types";

export const migration001: Migration = {
  version: 1,
  name: "initial",
  up: `
CREATE TABLE foods (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  brand TEXT,
  source TEXT NOT NULL DEFAULT 'user',
  barcode TEXT,
  off_id TEXT,
  kcal REAL NOT NULL DEFAULT 0,
  protein REAL NOT NULL DEFAULT 0,
  carbs REAL NOT NULL DEFAULT 0,
  sugars REAL NOT NULL DEFAULT 0,
  fat REAL NOT NULL DEFAULT 0,
  saturated_fat REAL NOT NULL DEFAULT 0,
  fiber REAL NOT NULL DEFAULT 0,
  salt REAL NOT NULL DEFAULT 0,
  is_liquid INTEGER NOT NULL DEFAULT 0,
  default_serving_g REAL,
  serving_label TEXT,
  image_uri TEXT,
  is_favorite INTEGER NOT NULL DEFAULT 0,
  usage_count INTEGER NOT NULL DEFAULT 0,
  is_estimated INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX idx_foods_name ON foods (name);
CREATE INDEX idx_foods_barcode ON foods (barcode);
CREATE INDEX idx_foods_usage ON foods (usage_count DESC);

CREATE TABLE recipes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  photo_uri TEXT,
  servings REAL NOT NULL DEFAULT 1,
  notes TEXT,
  is_favorite INTEGER NOT NULL DEFAULT 0,
  usage_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX idx_recipes_name ON recipes (name);

CREATE TABLE recipe_items (
  id TEXT PRIMARY KEY,
  recipe_id TEXT NOT NULL REFERENCES recipes (id),
  food_id TEXT REFERENCES foods (id),
  child_recipe_id TEXT REFERENCES recipes (id),
  quantity_g REAL,
  servings REAL,
  sort INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  CHECK (
    (food_id IS NOT NULL AND child_recipe_id IS NULL AND quantity_g IS NOT NULL)
    OR
    (food_id IS NULL AND child_recipe_id IS NOT NULL AND servings IS NOT NULL)
  )
);
CREATE INDEX idx_recipe_items_recipe ON recipe_items (recipe_id);

CREATE TABLE meal_types (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  icon TEXT,
  sort INTEGER NOT NULL DEFAULT 0,
  is_custom INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE meals (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  meal_type_id TEXT NOT NULL REFERENCES meal_types (id),
  name TEXT,
  time TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX idx_meals_date ON meals (date);

CREATE TABLE meal_entries (
  id TEXT PRIMARY KEY,
  meal_id TEXT NOT NULL REFERENCES meals (id),
  source_kind TEXT NOT NULL,
  food_id TEXT REFERENCES foods (id),
  recipe_id TEXT REFERENCES recipes (id),
  label TEXT,
  quantity_g REAL,
  servings REAL,
  kcal REAL NOT NULL DEFAULT 0,
  protein REAL NOT NULL DEFAULT 0,
  carbs REAL NOT NULL DEFAULT 0,
  sugars REAL NOT NULL DEFAULT 0,
  fat REAL NOT NULL DEFAULT 0,
  saturated_fat REAL NOT NULL DEFAULT 0,
  fiber REAL NOT NULL DEFAULT 0,
  salt REAL NOT NULL DEFAULT 0,
  is_estimated INTEGER NOT NULL DEFAULT 0,
  confidence REAL,
  note TEXT,
  photo_uri TEXT,
  created_via TEXT NOT NULL DEFAULT 'manual',
  sort INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  CHECK (source_kind IN ('food', 'recipe', 'free'))
);
CREATE INDEX idx_meal_entries_meal ON meal_entries (meal_id);

CREATE TABLE profile (
  id TEXT PRIMARY KEY,
  sex TEXT,
  birthdate TEXT,
  height_cm REAL,
  activity_level TEXT,
  goal TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE targets (
  id TEXT PRIMARY KEY,
  valid_from TEXT NOT NULL,
  kcal REAL NOT NULL,
  protein_g REAL NOT NULL,
  carbs_g REAL NOT NULL,
  fat_g REAL NOT NULL,
  steps INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX idx_targets_valid_from ON targets (valid_from DESC);

CREATE TABLE weight_logs (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  weight_kg REAL NOT NULL,
  body_fat_pct REAL,
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE UNIQUE INDEX idx_weight_logs_date ON weight_logs (date);

CREATE TABLE step_logs (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  steps INTEGER NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE UNIQUE INDEX idx_step_logs_date ON step_logs (date);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`,
};
```

Nota sull'indice unico di `weight_logs` e `step_logs`: la data è unica anche fra le righe cancellate logicamente. È voluto, un giorno ha una sola misura; il "cancella" per queste due tabelle è una cancellazione fisica.

- [ ] **Step 6: Scrivere `src/db/migrations/types.ts`**

```ts
export interface Migration {
  version: number;
  name: string;
  up: string;
}
```

- [ ] **Step 7: Scrivere `src/db/migrations/002_meal_types.ts`**

Gli id sono costanti e non generati, così sono referenziabili dal seed e dai test.

```ts
import type { Migration } from "@/src/db/migrations/types";

export const MEAL_TYPE_IDS = {
  breakfast: "mt-breakfast",
  brunch: "mt-brunch",
  lunch: "mt-lunch",
  snack: "mt-snack",
  dinner: "mt-dinner",
} as const;

const row = (id: string, name: string, icon: string, sort: number) =>
  `INSERT INTO meal_types (id, name, icon, sort, is_custom, created_at, updated_at)
   VALUES ('${id}', '${name}', '${icon}', ${sort}, 0, datetime('now'), datetime('now'));`;

export const migration002: Migration = {
  version: 2,
  name: "meal_types",
  up: [
    row(MEAL_TYPE_IDS.breakfast, "colazione", "coffee", 10),
    row(MEAL_TYPE_IDS.brunch, "brunch", "egg", 20),
    row(MEAL_TYPE_IDS.lunch, "pranzo", "utensils", 30),
    row(MEAL_TYPE_IDS.snack, "snack", "apple", 40),
    row(MEAL_TYPE_IDS.dinner, "cena", "moon", 50),
  ].join("\n"),
};
```

- [ ] **Step 8: Scrivere `src/db/migrations/index.ts`**

```ts
import { migration001 } from "@/src/db/migrations/001_initial";
import { migration002 } from "@/src/db/migrations/002_meal_types";
import type { Migration } from "@/src/db/migrations/types";
import type { LocalDatabase } from "@/src/db/sqliteAdapter";
import { logger } from "@/src/utils/logger";

export type { Migration };
export { MEAL_TYPE_IDS } from "@/src/db/migrations/002_meal_types";

export const MIGRATIONS: Migration[] = [migration001, migration002];

/**
 * Applica le migrazioni mancanti in base a PRAGMA user_version e ritorna la
 * versione finale. Ogni migrazione gira in transazione: se fallisce, il DB
 * resta alla versione precedente invece che a metà.
 */
export async function runMigrations(db: LocalDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ user_version: number }>(
    "PRAGMA user_version",
  );
  let current = row?.user_version ?? 0;

  for (const migration of MIGRATIONS) {
    if (migration.version <= current) continue;

    await db.withTransactionAsync(async () => {
      await db.execAsync(migration.up);
    });
    // PRAGMA non accetta parametri bind: la versione è un numero dal registro
    // interno, mai un input esterno.
    await db.execAsync(`PRAGMA user_version = ${migration.version}`);
    current = migration.version;
    logger.info(`[db] migrazione ${migration.version} (${migration.name}) applicata`);
  }

  return current;
}
```

- [ ] **Step 9: Scrivere `src/db/ids.ts`**

```ts
import * as Crypto from "expo-crypto";

export const newId = (): string => Crypto.randomUUID();

export const nowIso = (): string => new Date().toISOString();
```

Il mock di `expo-crypto` del preset jest-expo **non** espone `randomUUID` (verificato:
ritorna `undefined`). Il Task 1 lo risolve mappando `expo-crypto` a
`jest/mocks/expo-crypto.js` via `moduleNameMapper`. Un `jest.setup.js` che patcha il
modulo non funziona: il registry dei moduli viene resettato per file di test, e un
`jest.mock()` con factory non puo' referenziare variabili fuori scope.

- [ ] **Step 10: Scrivere `src/db/index.ts`**

```ts
import { DB_NAME } from "@/src/consts";
import { runMigrations } from "@/src/db/migrations";
import { wrapDatabase, type LocalDatabase } from "@/src/db/sqliteAdapter";
import { logger } from "@/src/utils/logger";
import * as SQLite from "expo-sqlite";

let dbPromise: Promise<LocalDatabase> | null = null;

export function getDb(): Promise<LocalDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = wrapDatabase(await SQLite.openDatabaseAsync(DB_NAME));
      // PRAGMA di connessione: vanno impostate una volta all'apertura, fuori da
      // qualsiasi transazione (journal_mode e synchronous non sono modificabili
      // dentro una transazione).
      await db.execAsync(
        "PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON;",
      );
      return db;
    })();
  }
  return dbPromise;
}

export async function initDatabase(): Promise<void> {
  const db = await getDb();
  const version = await runMigrations(db);
  logger.info(`[db] schema alla versione ${version}`);
}

export async function closeDb(): Promise<void> {
  if (!dbPromise) return;
  const current = dbPromise;
  dbPromise = null;
  try {
    await (await current).closeAsync();
  } catch (error) {
    logger.error("[db] errore chiusura", error);
  }
}
```

- [ ] **Step 11: Correggere il quarto test**

Il quarto test dello Step 2 verifica che il runner parta dalla `user_version` dichiarata. Con `user_version = 1` la 002 gira su un DB senza tabella `meal_types` e deve fallire. Se il comportamento osservato è diverso, il test va corretto **descrivendo il comportamento reale corretto**, non rimosso.

- [ ] **Step 12: Eseguire i test**

Run: `npx jest src/db`
Atteso: PASS, 5 test.

- [ ] **Step 13: Agganciare `initDatabase()` all'avvio**

In `src/App.tsx`, dentro l'effetto di inizializzazione, sostituire il corpo vuoto con `await initDatabase();`.

- [ ] **Step 14: Gate completo**

```bash
npm run typecheck && npm run lint && npm test && npm run android
adb exec-out screencap -p > /tmp/kaltrack-task2.png
adb logcat -d -s ReactNativeJS:V | tail -30
```

Atteso: nei log compare `[db] schema alla versione 2`. L'app si avvia come nel Task 1.

- [ ] **Step 15: Commit**

```bash
git add -A
git commit -m "Add the local SQLite layer with numbered migrations

Introduces the database foundation for the local-first design.

The LocalDatabase interface abstracts the driver, following the pattern
proven in ZCC-omnia-marine: the app fills it with expo-sqlite while the
tests fill it with better-sqlite3 in memory, so migrations and queries
are covered by real SQL assertions running on Node rather than mocks.
Swapping in an encrypted driver later touches only sqliteAdapter.ts.

Schema is created by numbered migrations tracked in PRAGMA user_version,
each applied inside a transaction so a failure leaves the database at
the previous version instead of half-migrated. Migration 001 creates the
eleven Phase 1 tables; 002 seeds the five default meal types with stable
ids so seeds and tests can reference them.

Every table carries id/created_at/updated_at/deleted_at to stay
sync-ready for a future backend. weight_logs and step_logs additionally
carry a unique index on date, since a day has exactly one measurement.

Connection PRAGMAs (WAL, synchronous NORMAL, foreign_keys) are set once
at open time, outside any transaction, as journal_mode and synchronous
cannot be changed inside one."
```

---

## Task 3: Logica di dominio pura

Tutta la matematica dell'app vive qui, senza dipendenze da React né dal DB, quindi è testabile a costo zero. Le schermate non calcolano mai nulla per conto proprio.

**Files:**
- Create: `src/domain/nutrition.ts`, `src/domain/nutrition.test.ts`, `src/domain/targets.ts`, `src/domain/targets.test.ts`, `src/domain/date.ts`, `src/domain/date.test.ts`

**Interfaces:**
- Consumes: niente
- Produces:
  - `Nutrients` = `{ kcal, protein, carbs, sugars, fat, saturatedFat, fiber, salt }`, tutti `number`
  - `EMPTY_NUTRIENTS: Nutrients`
  - `scaleNutrients(per100: Nutrients, grams: number): Nutrients`
  - `sumNutrients(items: Nutrients[]): Nutrients`
  - `roundNutrients(n: Nutrients, decimals?: number): Nutrients`
  - `kcalFromMacros(protein: number, carbs: number, fat: number): number`
  - `RecipeNode` = `{ servings: number; items: RecipeItemNode[] }`
  - `RecipeItemNode` = `{ kind: "food"; per100: Nutrients; grams: number } | { kind: "recipe"; child: RecipeNode; servings: number }`
  - `recipeTotals(node: RecipeNode): Nutrients`
  - `recipePerServing(node: RecipeNode): Nutrients`
  - `Sex`, `ActivityLevel`, `Goal`, `ACTIVITY_FACTORS`, `GOAL_KCAL_FACTOR`
  - `ageAt(birthdate: string, on: Date): number`
  - `bmr(input: { sex: Sex; weightKg: number; heightCm: number; age: number }): number`
  - `tdee(bmrValue: number, activity: ActivityLevel): number`
  - `suggestTargets(input): { kcal: number; proteinG: number; carbsG: number; fatG: number }`
  - `todayIso(now?: Date): string`, `toIsoDate(d: Date): string`, `addDays(iso: string, days: number): string`, `startOfWeek(iso: string): string`, `dayLabelKind(iso: string, today: string): "today" | "yesterday" | "tomorrow" | "other"`

- [ ] **Step 1: Scrivere `src/domain/nutrition.test.ts` (fallisce)**

```ts
import {
  EMPTY_NUTRIENTS,
  kcalFromMacros,
  recipePerServing,
  recipeTotals,
  roundNutrients,
  scaleNutrients,
  sumNutrients,
  type Nutrients,
  type RecipeNode,
} from "@/src/domain/nutrition";

const nutrients = (partial: Partial<Nutrients>): Nutrients => ({
  ...EMPTY_NUTRIENTS,
  ...partial,
});

// Petto di pollo crudo, valori per 100 g.
const CHICKEN = nutrients({ kcal: 165, protein: 31, carbs: 0, fat: 3.6 });
// Riso bianco crudo, valori per 100 g.
const RICE = nutrients({ kcal: 358, protein: 7, carbs: 79, fat: 0.6, fiber: 1.4 });

describe("scaleNutrients", () => {
  it("scala i valori per 100 g alla quantità richiesta", () => {
    const result = scaleNutrients(CHICKEN, 150);
    expect(result.kcal).toBeCloseTo(247.5);
    expect(result.protein).toBeCloseTo(46.5);
    expect(result.fat).toBeCloseTo(5.4);
  });

  it("con 0 grammi ritorna tutti zeri", () => {
    expect(scaleNutrients(CHICKEN, 0)).toEqual(EMPTY_NUTRIENTS);
  });

  it("con grammi negativi ritorna tutti zeri invece di valori negativi", () => {
    expect(scaleNutrients(CHICKEN, -50)).toEqual(EMPTY_NUTRIENTS);
  });
});

describe("sumNutrients", () => {
  it("somma campo per campo", () => {
    const result = sumNutrients([
      scaleNutrients(CHICKEN, 100),
      scaleNutrients(RICE, 100),
    ]);
    expect(result.kcal).toBeCloseTo(523);
    expect(result.protein).toBeCloseTo(38);
    expect(result.fiber).toBeCloseTo(1.4);
  });

  it("su lista vuota ritorna zeri", () => {
    expect(sumNutrients([])).toEqual(EMPTY_NUTRIENTS);
  });
});

describe("kcalFromMacros", () => {
  it("usa 4/4/9 kcal per grammo", () => {
    expect(kcalFromMacros(30, 50, 10)).toBe(30 * 4 + 50 * 4 + 10 * 9);
  });
});

describe("roundNutrients", () => {
  it("arrotonda a un decimale per default", () => {
    const result = roundNutrients(nutrients({ kcal: 247.4999, protein: 46.55 }));
    expect(result.kcal).toBe(247.5);
    expect(result.protein).toBe(46.6);
  });
});

describe("recipeTotals", () => {
  it("somma gli ingredienti scalati", () => {
    const recipe: RecipeNode = {
      servings: 2,
      items: [
        { kind: "food", per100: CHICKEN, grams: 200 },
        { kind: "food", per100: RICE, grams: 100 },
      ],
    };
    const totals = recipeTotals(recipe);
    expect(totals.kcal).toBeCloseTo(330 + 358);
    expect(totals.protein).toBeCloseTo(62 + 7);
  });

  it("include le ricette annidate contate a porzioni", () => {
    const base: RecipeNode = {
      servings: 4,
      items: [{ kind: "food", per100: RICE, grams: 400 }],
    };
    // base: 1432 kcal totali, 358 kcal a porzione.
    const outer: RecipeNode = {
      servings: 1,
      items: [
        { kind: "recipe", child: base, servings: 2 },
        { kind: "food", per100: CHICKEN, grams: 100 },
      ],
    };
    expect(recipeTotals(outer).kcal).toBeCloseTo(358 * 2 + 165);
  });

  it("su una ricetta senza ingredienti ritorna zeri", () => {
    expect(recipeTotals({ servings: 2, items: [] })).toEqual(EMPTY_NUTRIENTS);
  });
});

describe("recipePerServing", () => {
  it("divide i totali per il numero di porzioni", () => {
    const recipe: RecipeNode = {
      servings: 4,
      items: [{ kind: "food", per100: RICE, grams: 400 }],
    };
    expect(recipePerServing(recipe).kcal).toBeCloseTo(358);
  });

  it("tratta 0 porzioni come 1 invece di dividere per zero", () => {
    const recipe: RecipeNode = {
      servings: 0,
      items: [{ kind: "food", per100: RICE, grams: 100 }],
    };
    expect(recipePerServing(recipe).kcal).toBeCloseTo(358);
  });
});
```

- [ ] **Step 2: Eseguire per vederlo fallire**

Run: `npx jest src/domain/nutrition.test.ts`
Atteso: FAIL, `Cannot find module '@/src/domain/nutrition'`.

- [ ] **Step 3: Scrivere `src/domain/nutrition.ts`**

```ts
export interface Nutrients {
  kcal: number;
  protein: number;
  carbs: number;
  sugars: number;
  fat: number;
  saturatedFat: number;
  fiber: number;
  salt: number;
}

export const EMPTY_NUTRIENTS: Nutrients = {
  kcal: 0,
  protein: 0,
  carbs: 0,
  sugars: 0,
  fat: 0,
  saturatedFat: 0,
  fiber: 0,
  salt: 0,
};

const KEYS = Object.keys(EMPTY_NUTRIENTS) as (keyof Nutrients)[];

export const KCAL_PER_G = { protein: 4, carbs: 4, fat: 9 } as const;

export const kcalFromMacros = (
  protein: number,
  carbs: number,
  fat: number,
): number =>
  protein * KCAL_PER_G.protein + carbs * KCAL_PER_G.carbs + fat * KCAL_PER_G.fat;

/** Scala valori espressi per 100 g alla quantità indicata. Quantità <= 0 -> zeri. */
export function scaleNutrients(per100: Nutrients, grams: number): Nutrients {
  if (grams <= 0) return { ...EMPTY_NUTRIENTS };
  const factor = grams / 100;
  const result = { ...EMPTY_NUTRIENTS };
  for (const key of KEYS) result[key] = per100[key] * factor;
  return result;
}

export function sumNutrients(items: Nutrients[]): Nutrients {
  const result = { ...EMPTY_NUTRIENTS };
  for (const item of items) {
    for (const key of KEYS) result[key] += item[key];
  }
  return result;
}

export function roundNutrients(n: Nutrients, decimals = 1): Nutrients {
  const factor = 10 ** decimals;
  const result = { ...EMPTY_NUTRIENTS };
  for (const key of KEYS) result[key] = Math.round(n[key] * factor) / factor;
  return result;
}

export interface RecipeNode {
  servings: number;
  items: RecipeItemNode[];
}

export type RecipeItemNode =
  | { kind: "food"; per100: Nutrients; grams: number }
  | { kind: "recipe"; child: RecipeNode; servings: number };

/** Valori nutrizionali dell'intera ricetta (tutte le porzioni). */
export function recipeTotals(node: RecipeNode): Nutrients {
  return sumNutrients(
    node.items.map((item) =>
      item.kind === "food"
        ? scaleNutrients(item.per100, item.grams)
        : scalePortions(recipePerServing(item.child), item.servings),
    ),
  );
}

/** Valori di una singola porzione. Con servings <= 0 la ricetta vale 1 porzione. */
export function recipePerServing(node: RecipeNode): Nutrients {
  const servings = node.servings > 0 ? node.servings : 1;
  const totals = recipeTotals(node);
  const result = { ...EMPTY_NUTRIENTS };
  for (const key of KEYS) result[key] = totals[key] / servings;
  return result;
}

function scalePortions(perServing: Nutrients, servings: number): Nutrients {
  if (servings <= 0) return { ...EMPTY_NUTRIENTS };
  const result = { ...EMPTY_NUTRIENTS };
  for (const key of KEYS) result[key] = perServing[key] * servings;
  return result;
}
```

- [ ] **Step 4: Eseguire i test**

Run: `npx jest src/domain/nutrition.test.ts`
Atteso: PASS.

- [ ] **Step 5: Scrivere `src/domain/targets.test.ts` (fallisce)**

```ts
import {
  ACTIVITY_FACTORS,
  ageAt,
  bmr,
  suggestTargets,
  tdee,
} from "@/src/domain/targets";

describe("ageAt", () => {
  it("calcola l'età compiuta", () => {
    expect(ageAt("1995-06-15", new Date("2026-08-28T12:00:00"))).toBe(31);
  });

  it("non conta il compleanno non ancora arrivato", () => {
    expect(ageAt("1995-12-31", new Date("2026-08-28T12:00:00"))).toBe(30);
  });

  it("conta il compleanno del giorno stesso", () => {
    expect(ageAt("1995-08-28", new Date("2026-08-28T12:00:00"))).toBe(31);
  });
});

describe("bmr", () => {
  // Mifflin-St Jeor: 10*kg + 6.25*cm - 5*eta + 5 (uomo) / -161 (donna)
  it("calcola il metabolismo basale per un uomo", () => {
    expect(
      bmr({ sex: "male", weightKg: 80, heightCm: 180, age: 30 }),
    ).toBeCloseTo(10 * 80 + 6.25 * 180 - 5 * 30 + 5);
  });

  it("calcola il metabolismo basale per una donna", () => {
    expect(
      bmr({ sex: "female", weightKg: 60, heightCm: 165, age: 30 }),
    ).toBeCloseTo(10 * 60 + 6.25 * 165 - 5 * 30 - 161);
  });
});

describe("tdee", () => {
  it("moltiplica per il fattore di attività", () => {
    expect(tdee(1800, "moderate")).toBeCloseTo(1800 * ACTIVITY_FACTORS.moderate);
  });
});

describe("suggestTargets", () => {
  const input = {
    sex: "male" as const,
    weightKg: 80,
    heightCm: 180,
    age: 30,
    activity: "moderate" as const,
  };

  it("in mantenimento le calorie coincidono col TDEE arrotondato", () => {
    const expected = Math.round(tdee(bmr(input), "moderate"));
    expect(suggestTargets({ ...input, goal: "maintain" }).kcal).toBe(expected);
  });

  it("in definizione taglia il 15%", () => {
    const maintain = suggestTargets({ ...input, goal: "maintain" }).kcal;
    expect(suggestTargets({ ...input, goal: "cut" }).kcal).toBe(
      Math.round(maintain * 0.85),
    );
  });

  it("in massa aggiunge il 10%", () => {
    const maintain = suggestTargets({ ...input, goal: "maintain" }).kcal;
    expect(suggestTargets({ ...input, goal: "bulk" }).kcal).toBe(
      Math.round(maintain * 1.1),
    );
  });

  it("assegna 2 g di proteine e 0.9 g di grassi per kg", () => {
    const result = suggestTargets({ ...input, goal: "maintain" });
    expect(result.proteinG).toBe(160);
    expect(result.fatG).toBe(72);
  });

  it("i macro suggeriti ricostruiscono le calorie a meno dell'arrotondamento", () => {
    const r = suggestTargets({ ...input, goal: "maintain" });
    const fromMacros = r.proteinG * 4 + r.carbsG * 4 + r.fatG * 9;
    expect(Math.abs(fromMacros - r.kcal)).toBeLessThanOrEqual(4);
  });

  it("non produce mai carboidrati negativi", () => {
    const result = suggestTargets({
      sex: "male",
      weightKg: 120,
      heightCm: 160,
      age: 70,
      activity: "sedentary",
      goal: "cut",
    });
    expect(result.carbsG).toBeGreaterThanOrEqual(0);
  });
});
```

- [ ] **Step 6: Eseguire per vederlo fallire**

Run: `npx jest src/domain/targets.test.ts`
Atteso: FAIL.

- [ ] **Step 7: Scrivere `src/domain/targets.ts`**

```ts
export type Sex = "male" | "female";
export type ActivityLevel =
  | "sedentary"
  | "light"
  | "moderate"
  | "active"
  | "very_active";
export type Goal = "cut" | "maintain" | "bulk";

export const ACTIVITY_FACTORS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

export const GOAL_KCAL_FACTOR: Record<Goal, number> = {
  cut: 0.85,
  maintain: 1,
  bulk: 1.1,
};

const PROTEIN_G_PER_KG = 2;
const FAT_G_PER_KG = 0.9;

/** Età compiuta alla data indicata. `birthdate` in formato YYYY-MM-DD. */
export function ageAt(birthdate: string, on: Date): number {
  const [year, month, day] = birthdate.split("-").map(Number);
  let age = on.getFullYear() - year;
  const monthDiff = on.getMonth() + 1 - month;
  if (monthDiff < 0 || (monthDiff === 0 && on.getDate() < day)) age -= 1;
  return age;
}

/** Metabolismo basale, formula di Mifflin-St Jeor. */
export function bmr(input: {
  sex: Sex;
  weightKg: number;
  heightCm: number;
  age: number;
}): number {
  const base = 10 * input.weightKg + 6.25 * input.heightCm - 5 * input.age;
  return input.sex === "male" ? base + 5 : base - 161;
}

export const tdee = (bmrValue: number, activity: ActivityLevel): number =>
  bmrValue * ACTIVITY_FACTORS[activity];

export interface TargetSuggestion {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

/**
 * Obiettivi suggeriti. Proteine e grassi si fissano sul peso corporeo, i
 * carboidrati assorbono il residuo calorico (mai sotto zero).
 */
export function suggestTargets(input: {
  sex: Sex;
  weightKg: number;
  heightCm: number;
  age: number;
  activity: ActivityLevel;
  goal: Goal;
}): TargetSuggestion {
  const kcal = Math.round(
    tdee(bmr(input), input.activity) * GOAL_KCAL_FACTOR[input.goal],
  );
  const proteinG = Math.round(input.weightKg * PROTEIN_G_PER_KG);
  const fatG = Math.round(input.weightKg * FAT_G_PER_KG);
  const carbsG = Math.max(0, Math.round((kcal - proteinG * 4 - fatG * 9) / 4));
  return { kcal, proteinG, carbsG, fatG };
}
```

- [ ] **Step 8: Scrivere `src/domain/date.test.ts` (fallisce)**

Attenzione al fuso: le date vanno costruite dai componenti locali, non da `toISOString()`, altrimenti a sera la data slitta al giorno dopo.

```ts
import {
  addDays,
  dayLabelKind,
  startOfWeek,
  todayIso,
  toIsoDate,
} from "@/src/domain/date";

describe("toIsoDate", () => {
  it("usa la data locale, non UTC", () => {
    // 23:30 locale: con toISOString() in Europa/Roma diventerebbe il giorno dopo.
    expect(toIsoDate(new Date(2026, 7, 28, 23, 30))).toBe("2026-08-28");
  });

  it("mette lo zero davanti a mese e giorno", () => {
    expect(toIsoDate(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});

describe("todayIso", () => {
  it("formatta la data passata", () => {
    expect(todayIso(new Date(2026, 7, 28, 10, 0))).toBe("2026-08-28");
  });
});

describe("addDays", () => {
  it("somma giorni", () => {
    expect(addDays("2026-08-28", 3)).toBe("2026-08-31");
  });

  it("attraversa il cambio di mese", () => {
    expect(addDays("2026-08-31", 1)).toBe("2026-09-01");
  });

  it("sottrae con valori negativi", () => {
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("gestisce l'anno bisestile", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  });
});

describe("startOfWeek", () => {
  it("torna al lunedì", () => {
    // 2026-08-28 è un venerdì.
    expect(startOfWeek("2026-08-28")).toBe("2026-08-24");
  });

  it("su una domenica torna al lunedì precedente", () => {
    expect(startOfWeek("2026-08-30")).toBe("2026-08-24");
  });

  it("su un lunedì resta lo stesso giorno", () => {
    expect(startOfWeek("2026-08-24")).toBe("2026-08-24");
  });
});

describe("dayLabelKind", () => {
  it("riconosce oggi, ieri e domani", () => {
    expect(dayLabelKind("2026-08-28", "2026-08-28")).toBe("today");
    expect(dayLabelKind("2026-08-27", "2026-08-28")).toBe("yesterday");
    expect(dayLabelKind("2026-08-29", "2026-08-28")).toBe("tomorrow");
    expect(dayLabelKind("2026-08-01", "2026-08-28")).toBe("other");
  });
});
```

- [ ] **Step 9: Eseguire per vederlo fallire**

Run: `npx jest src/domain/date.test.ts`
Atteso: FAIL.

- [ ] **Step 10: Scrivere `src/domain/date.ts`**

```ts
const pad = (n: number): string => String(n).padStart(2, "0");

/** Data locale in formato YYYY-MM-DD. Non usa toISOString(): sposterebbe il giorno. */
export const toIsoDate = (d: Date): string =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const todayIso = (now: Date = new Date()): string => toIsoDate(now);

const parseIso = (iso: string): Date => {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
};

export function addDays(iso: string, days: number): string {
  const d = parseIso(iso);
  d.setDate(d.getDate() + days);
  return toIsoDate(d);
}

/** Lunedì della settimana a cui appartiene la data. */
export function startOfWeek(iso: string): string {
  const d = parseIso(iso);
  // getDay(): 0 = domenica. Portiamo tutto su lunedì = 0.
  const offset = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - offset);
  return toIsoDate(d);
}

export type DayLabelKind = "today" | "yesterday" | "tomorrow" | "other";

/** Classifica una data rispetto a oggi. La traduzione resta alla UI. */
export function dayLabelKind(iso: string, today: string): DayLabelKind {
  if (iso === today) return "today";
  if (iso === addDays(today, -1)) return "yesterday";
  if (iso === addDays(today, 1)) return "tomorrow";
  return "other";
}
```

- [ ] **Step 11: Gate**

```bash
npm run typecheck && npm run lint && npm test
```

Atteso: tutti verdi. Nessuna verifica su emulatore: questo task non tocca la UI.

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "Add the pure domain layer for nutrition, targets and dates

All arithmetic the app performs now lives in src/domain as pure
functions with no React and no database dependency, so screens never
compute anything themselves and every rule is covered by fast unit
tests.

nutrition.ts models a Nutrients record and the operations over it:
scaling per-100g values to a quantity, summing, rounding, and computing
recipe totals. Recipes can nest: a nested recipe contributes by
servings rather than grams, which keeps the unit unambiguous and matches
how a composed meal is actually logged. Non-positive quantities collapse
to zeros and a zero-serving recipe counts as one serving, so no caller
can produce negative macros or divide by zero.

targets.ts implements Mifflin-St Jeor BMR, activity-factor TDEE and the
suggested daily targets: protein and fat are pinned to body weight
(2 g/kg and 0.9 g/kg) and carbohydrates absorb the caloric remainder,
floored at zero so an extreme cut cannot yield a negative value.

date.ts builds ISO dates from local components rather than
toISOString(), which would roll the date forward in the evening for
positive UTC offsets: a diary entry logged at 23:30 must belong to that
day."
```

---

## Task 4: Design system e navigazione

**Files:**
- Create: `src/components/kal/Card.tsx`, `Primitives.tsx`, `SearchBar.tsx`, `GradientHeader.tsx`, `ScreenBackground.tsx`, `Avatar.tsx`, `TrafficDot.tsx`, `Filters.tsx`, `index.ts`; `src/components/SwipeTabView.tsx`, `src/components/ExitConfirm.tsx`, `src/components/toastConfig.tsx`; `src/hooks/useFocusData.ts`, `src/hooks/useAppNav.ts`, `src/hooks/useOnlineStatus.ts`; `src/navigation/screens/TodayScreen.tsx`, `ProgressScreen.tsx`, `GymScreen.tsx`, `ProfileScreen.tsx`
- Modify: `src/styles.ts` (palette KalTrack e colori dei macro), `src/navigation/index.tsx` (4 tab), `src/i18n/locales/it.json`, `src/i18n/locales/en.json`, `src/App.tsx` (toastConfig)
- Delete: `src/navigation/screens/HomeScreen.tsx`

**Interfaces:**
- Consumes: `theme` da `@/src/styles`
- Produces:
  - `useFocusData<T>(loader: () => Promise<T>): { data: T | null; loading: boolean; reload: () => void }`
  - `useAppNav(): { navigate; goBack }` tipizzato su `NavParams`
  - `useOnlineStatus(): boolean`
  - da `@/src/components/kal`: `Card`, `SectionLabel`, `EmptyState`, `IconTile`, `Chip`, `StatTiles`, `SearchBar`, `GradientHeader`, `HeaderCircleButton`, `ScreenBackground`, `Avatar`, `TrafficDot`, `FilterChipGroup`, `FilterButton`, `PickerField`, `DateRangeField`
  - `theme.colors.macro` = `{ protein, carbs, fat }`

- [ ] **Step 1: Portare i componenti da Omnia Marine**

```bash
mkdir -p src/components/kal
cp ~/Desktop/Dieffetech/ZCC-omnia-marine/src/components/omnia/{Card,Primitives,SearchBar,GradientHeader,ScreenBackground,Avatar,TrafficDot,Filters,index}.tsx src/components/kal/ 2>/dev/null
mv src/components/kal/index.tsx src/components/kal/index.ts
cp ~/Desktop/Dieffetech/ZCC-omnia-marine/src/components/{SwipeTabView,ExitConfirm,toastConfig}.tsx src/components/
cp ~/Desktop/Dieffetech/ZCC-omnia-marine/src/hooks/{useFocusData,useAppNav,useOnlineStatus}.ts src/hooks/
```

`SyncStatusBar.tsx` **non** va copiato: non esiste sync.

- [ ] **Step 2: Adattare gli import dei file copiati**

In ogni file copiato:
- sostituire `@/src/components/omnia` con `@/src/components/kal`
- rimuovere il re-export di `SyncStatusBar` da `index.ts`
- in `useFocusData.ts` rimuovere l'import e la chiamata a `useLookupsStore.getState().load()`: qui non esistono lookup, il loader parte diretto
- in `useOnlineStatus.ts` rimuovere l'import di `useAuthStore` e il ramo `isDemo`: il poll di fallback serviva solo al simulatore iOS in demo, qui basta il listener nativo più il re-check al foreground
- in `useAppNav.ts` sostituire l'interfaccia `NavParams` con le rotte di KalTrack (vedi Step 5)
- rimuovere da `Filters.tsx` e `Card.tsx` qualsiasi riferimento a tipi di dominio Omnia; se un componente è troppo legato a Omnia per essere ripulito in pochi minuti, **non portarlo**: si riscrive quando serve

- [ ] **Step 3: Aggiornare la palette in `src/styles.ts`**

Sostituire i tre valori di brand e aggiungere i colori dei macro, che sono semantici e devono restare identici in tutta l'app:

```ts
const palette = {
  primary: "#10b981",
  primaryDark: "#059669",
  secondary: "#f59e0b",

  success: "#22c55e",
  error: "#ef4444",
  warning: "#f97316",
  info: "#3b82f6",

  // resto invariato (white, black, gray50..gray900)
};

// Colori dei macronutrienti: sempre gli stessi in grafici, barre e legende.
const macro = {
  protein: "#3b82f6",
  carbs: "#f59e0b",
  fat: "#a855f7",
};
```

E nell'export: `colors: { ...palette, macro }`.

Aggiornare anche il `backgroundColor` del plugin `expo-splash-screen` in `app.json` da `#208AEF` a `#10b981`.

- [ ] **Step 4: Creare le quattro schermate segnaposto**

Ognuna in `src/navigation/screens/`, tutte con la stessa forma. Esempio per `TodayScreen.tsx`:

```tsx
import { ScreenBackground } from "@/src/components/kal";
import { Text } from "@/src/components/ui";
import { useTranslation } from "@/src/hooks/useTranslation";
import { theme } from "@/src/styles";
import React from "react";
import { StyleSheet, View } from "react-native";

export function TodayScreen() {
  const { t } = useTranslation();
  return (
    <ScreenBackground>
      <View style={styles.container}>
        <Text style={styles.title}>{t("tabs.today")}</Text>
      </View>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: theme.spacing.md,
  },
  title: {
    fontSize: 20,
    fontWeight: "600",
  },
});
```

Le altre tre identiche con `tabs.progress`, `tabs.gym`, `tabs.profile`.

- [ ] **Step 5: Riscrivere il tab navigator**

In `src/navigation/index.tsx`, sostituire i due tab con quattro. Icone lucide: `CalendarDays` (Oggi), `TrendingUp` (Progressi), `Dumbbell` (Palestra), `User` (Profilo). Il RootStack contiene solo `Tabs`.

Aggiornare `useAppNav.ts` di conseguenza:

```ts
interface NavParams {
  TodayTab: undefined;
  ProgressTab: undefined;
  GymTab: undefined;
  ProfileTab: undefined;
}
```

Le rotte di dettaglio si aggiungono qui man mano che i task successivi le creano.

- [ ] **Step 6: Aggiungere le chiavi i18n**

In `it.json` e `en.json`, sotto una nuova chiave `tabs`:

```json
"tabs": { "today": "Oggi", "progress": "Progressi", "gym": "Palestra", "profile": "Profilo" }
```

Inglese: `Today`, `Progress`, `Gym`, `Profile`. Rimuovere le chiavi morte del template (login, ecc.).

- [ ] **Step 7: Agganciare `toastConfig` in `App.tsx`**

`<Toast config={toastConfig} />` al posto di `<Toast />`.

- [ ] **Step 8: Gate**

```bash
npm run typecheck && npm run lint && npm test && npm run android
```

- [ ] **Step 9: Screenshot di ogni tab**

```bash
for tab in today progress gym profile; do
  # toccare il tab sull'emulatore, poi:
  adb exec-out screencap -p > /tmp/kaltrack-task4-$tab.png
done
```

Verificare su ogni immagine: il titolo corretto al centro, la tab bar con quattro voci, l'icona attiva in verde `#10b981`, le label leggibili in Poppins e non troncate, nessun elemento sotto la barra di navigazione di sistema.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "Add the KalTrack design system and four-tab navigation

Ports the UI primitives and data hooks proven in ZCC-omnia-marine and
adapts them to a project with no backend.

Components moved to src/components/kal: Card, the Primitives set
(SectionLabel, EmptyState, IconTile, Chip, StatTiles), SearchBar,
GradientHeader, ScreenBackground, Avatar, TrafficDot and Filters.
SyncStatusBar was deliberately left behind since nothing syncs here.
TrafficDot is reused to show how the day sits against its target
(under, in range, over).

Hooks: useFocusData loads from the local database on screen focus,
showing the spinner only on first load and refreshing in the background
on re-focus, which is the right shape for an app that never waits on the
network; its hook into the Omnia lookups store was removed. useAppNav
centralises the single cast React Navigation's static API requires.
useOnlineStatus lost the demo-only polling branch.

Palette moved from the template indigo to emerald, and macro colours
(protein blue, carbs amber, fat purple) are now tokens so charts, bars
and legends cannot drift apart. The splash background follows.

The four tabs (Today, Progress, Gym, Profile) are placeholders wired to
navigation and i18n; screens land in the following tasks."
```

---

## Task 5: Alimenti (seed, CRUD, ricerca)

**Files:**
- Create: `src/domain/text.ts`, `src/domain/text.test.ts`, `src/types/nutrition.ts`, `src/db/migrations/003_name_norm.ts`, `src/db/queries/foods.ts`, `src/db/queries/foods.test.ts`, `src/db/seed/foods.ts`, `src/db/seed/index.ts`, `src/navigation/screens/FoodsScreen.tsx`, `src/navigation/screens/FoodFormScreen.tsx`, `src/containers/foods/FoodListItem.tsx`, `src/containers/foods/NutrientFields.tsx`
- Modify: `src/db/index.ts` (override per i test, applicazione seed), `src/db/migrations/index.ts`, `src/navigation/index.tsx`, `src/hooks/useAppNav.ts`, i due file i18n

**Interfaces:**
- Consumes: `LocalDatabase`, `getDb`, `newId`, `nowIso`, `Nutrients`, `scaleNutrients`
- Produces:
  - `normalizeText(value: string): string`
  - `FoodRow` (forma esatta della riga DB, snake_case)
  - `foodNutrients(row: FoodRow): Nutrients`
  - `FoodInput` (forma camelCase per creazione e modifica)
  - `searchFoods(term: string, limit?: number): Promise<FoodRow[]>`
  - `getFood(id: string): Promise<FoodRow | null>`
  - `createFood(input: FoodInput): Promise<string>`
  - `updateFood(id: string, input: FoodInput): Promise<void>`
  - `deleteFood(id: string): Promise<void>`
  - `toggleFoodFavorite(id: string): Promise<void>`
  - `incrementFoodUsage(id: string): Promise<void>`
  - `__setDbForTesting(db: LocalDatabase | null): void`

- [ ] **Step 1: Aggiungere l'override di test a `src/db/index.ts`**

Le query chiamano `getDb()`; per testarle su Node serve poterlo sostituire. Unica concessione al testing nel codice applicativo, esplicita nel nome.

```ts
let testDb: LocalDatabase | null = null;

/** Solo per i test: sostituisce la connessione usata da getDb(). */
export function __setDbForTesting(db: LocalDatabase | null): void {
  testDb = db;
}

export function getDb(): Promise<LocalDatabase> {
  if (testDb) return Promise.resolve(testDb);
  // ...resto invariato
}
```

- [ ] **Step 2: Scrivere `src/domain/text.test.ts` (fallisce)**

```ts
import { normalizeText } from "@/src/domain/text";

describe("normalizeText", () => {
  it("porta in minuscolo", () => {
    expect(normalizeText("Petto di Pollo")).toBe("petto di pollo");
  });

  it("toglie gli accenti", () => {
    expect(normalizeText("Caffè")).toBe("caffe");
    expect(normalizeText("Purè")).toBe("pure");
  });

  it("comprime gli spazi multipli e taglia i bordi", () => {
    expect(normalizeText("  yogurt   greco  ")).toBe("yogurt greco");
  });

  it("toglie la punteggiatura", () => {
    expect(normalizeText("Fior di latte, 20%")).toBe("fior di latte 20");
  });

  it("su stringa vuota ritorna stringa vuota", () => {
    expect(normalizeText("")).toBe("");
  });
});
```

- [ ] **Step 3: Scrivere `src/domain/text.ts`**

```ts
/**
 * Normalizzazione per ricerca e matching: minuscolo, senza accenti, senza
 * punteggiatura, spazi compressi. Usata sia dalla ricerca alimenti sia (in
 * Fase 2) dal matching degli alimenti dettati a voce.
 */
export function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
```

- [ ] **Step 4: Scrivere la migrazione 003**

`src/db/migrations/003_name_norm.ts`: aggiunge `name_norm TEXT` a `foods` e `recipes` con relativo indice. La colonna viene popolata dal codice a ogni scrittura, non da SQL.

```ts
import type { Migration } from "@/src/db/migrations/types";

export const migration003: Migration = {
  version: 3,
  name: "name_norm",
  up: `
ALTER TABLE foods ADD COLUMN name_norm TEXT NOT NULL DEFAULT '';
ALTER TABLE recipes ADD COLUMN name_norm TEXT NOT NULL DEFAULT '';
CREATE INDEX idx_foods_name_norm ON foods (name_norm);
CREATE INDEX idx_recipes_name_norm ON recipes (name_norm);
`,
};
```

Registrarla in `MIGRATIONS` e aggiornare il test dell'ultima versione (che usa già `MIGRATIONS[MIGRATIONS.length - 1].version`, quindi non va toccato).

- [ ] **Step 5: Definire i tipi in `src/types/nutrition.ts`**

```ts
import type { Nutrients } from "@/src/domain/nutrition";

export type FoodSource = "seed" | "off" | "user" | "ai";

/** Riga della tabella foods, così come torna da SQLite (snake_case). */
export interface FoodRow {
  id: string;
  name: string;
  name_norm: string;
  brand: string | null;
  source: FoodSource;
  barcode: string | null;
  off_id: string | null;
  kcal: number;
  protein: number;
  carbs: number;
  sugars: number;
  fat: number;
  saturated_fat: number;
  fiber: number;
  salt: number;
  is_liquid: number;
  default_serving_g: number | null;
  serving_label: string | null;
  image_uri: string | null;
  is_favorite: number;
  usage_count: number;
  is_estimated: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

/** Valori nutrizionali per 100 g/ml di un alimento. */
export const foodNutrients = (row: FoodRow): Nutrients => ({
  kcal: row.kcal,
  protein: row.protein,
  carbs: row.carbs,
  sugars: row.sugars,
  fat: row.fat,
  saturatedFat: row.saturated_fat,
  fiber: row.fiber,
  salt: row.salt,
});

/** Input di creazione/modifica alimento (camelCase, lato applicativo). */
export interface FoodInput {
  name: string;
  brand?: string | null;
  source?: FoodSource;
  barcode?: string | null;
  offId?: string | null;
  nutrients: Nutrients;
  isLiquid?: boolean;
  defaultServingG?: number | null;
  servingLabel?: string | null;
  imageUri?: string | null;
  isEstimated?: boolean;
}
```

- [ ] **Step 6: Scrivere `src/db/queries/foods.test.ts` (fallisce)**

```ts
import { createTestDb } from "@/src/db/__testing__/betterSqliteAdapter";
import { __setDbForTesting } from "@/src/db/index";
import { runMigrations } from "@/src/db/migrations";
import {
  createFood,
  deleteFood,
  getFood,
  incrementFoodUsage,
  searchFoods,
  toggleFoodFavorite,
  updateFood,
} from "@/src/db/queries/foods";
import { EMPTY_NUTRIENTS } from "@/src/domain/nutrition";

const chickenInput = {
  name: "Petto di pollo",
  nutrients: { ...EMPTY_NUTRIENTS, kcal: 165, protein: 31, fat: 3.6 },
};

beforeEach(async () => {
  const db = createTestDb();
  await runMigrations(db);
  __setDbForTesting(db);
});

afterEach(() => {
  __setDbForTesting(null);
});

describe("createFood", () => {
  it("salva l'alimento e ne ritorna l'id", async () => {
    const id = await createFood(chickenInput);
    const row = await getFood(id);

    expect(row?.name).toBe("Petto di pollo");
    expect(row?.kcal).toBe(165);
    expect(row?.source).toBe("user");
    expect(row?.deleted_at).toBeNull();
  });

  it("salva il nome normalizzato per la ricerca", async () => {
    const id = await createFood({ ...chickenInput, name: "Caffè Espresso" });
    expect((await getFood(id))?.name_norm).toBe("caffe espresso");
  });
});

describe("searchFoods", () => {
  beforeEach(async () => {
    await createFood(chickenInput);
    await createFood({
      name: "Riso bianco",
      nutrients: { ...EMPTY_NUTRIENTS, kcal: 358, carbs: 79 },
    });
    await createFood({
      name: "Yogurt greco",
      brand: "Fage",
      nutrients: { ...EMPTY_NUTRIENTS, kcal: 57, protein: 10 },
    });
  });

  it("trova per sottostringa", async () => {
    const results = await searchFoods("poll");
    expect(results.map((r) => r.name)).toEqual(["Petto di pollo"]);
  });

  it("ignora accenti e maiuscole", async () => {
    await createFood({ name: "Caffè", nutrients: EMPTY_NUTRIENTS });
    expect((await searchFoods("CAFFE")).map((r) => r.name)).toContain("Caffè");
  });

  it("con termine vuoto ritorna tutti gli alimenti vivi", async () => {
    expect(await searchFoods("")).toHaveLength(3);
  });

  it("non ritorna gli alimenti cancellati", async () => {
    const id = await createFood({ name: "Da buttare", nutrients: EMPTY_NUTRIENTS });
    await deleteFood(id);
    expect((await searchFoods("buttare"))).toHaveLength(0);
  });

  it("mette i preferiti prima e poi ordina per uso", async () => {
    const rice = (await searchFoods("riso"))[0];
    const yogurt = (await searchFoods("yogurt"))[0];
    await incrementFoodUsage(rice.id);
    await incrementFoodUsage(rice.id);
    await toggleFoodFavorite(yogurt.id);

    const results = await searchFoods("");
    expect(results[0].id).toBe(yogurt.id);
    expect(results[1].id).toBe(rice.id);
  });
});

describe("updateFood", () => {
  it("aggiorna i valori e il nome normalizzato", async () => {
    const id = await createFood(chickenInput);
    await updateFood(id, {
      ...chickenInput,
      name: "Petto di tacchino",
      nutrients: { ...EMPTY_NUTRIENTS, kcal: 135, protein: 30 },
    });

    const row = await getFood(id);
    expect(row?.name).toBe("Petto di tacchino");
    expect(row?.name_norm).toBe("petto di tacchino");
    expect(row?.kcal).toBe(135);
  });

  it("aggiorna updated_at", async () => {
    const id = await createFood(chickenInput);
    const before = (await getFood(id))!.updated_at;
    await new Promise((r) => setTimeout(r, 5));
    await updateFood(id, { ...chickenInput, name: "Pollo" });
    expect((await getFood(id))!.updated_at).not.toBe(before);
  });
});

describe("deleteFood", () => {
  it("cancella logicamente, non fisicamente", async () => {
    const id = await createFood(chickenInput);
    await deleteFood(id);

    expect(await getFood(id)).toBeNull();
    // La riga resta nel DB: le meal_entries storiche la referenziano ancora.
    const db = createTestDb;
    expect(db).toBeDefined();
  });
});

describe("toggleFoodFavorite", () => {
  it("alterna il flag", async () => {
    const id = await createFood(chickenInput);
    await toggleFoodFavorite(id);
    expect((await getFood(id))?.is_favorite).toBe(1);
    await toggleFoodFavorite(id);
    expect((await getFood(id))?.is_favorite).toBe(0);
  });
});
```

- [ ] **Step 7: Eseguire per vederlo fallire**

Run: `npx jest src/db/queries/foods.test.ts`
Atteso: FAIL.

- [ ] **Step 8: Scrivere `src/db/queries/foods.ts`**

Nessuna query concatena input utente: tutto passa da parametri bind.

```ts
import { getDb } from "@/src/db/index";
import { newId, nowIso } from "@/src/db/ids";
import { normalizeText } from "@/src/domain/text";
import type { FoodInput, FoodRow } from "@/src/types/nutrition";

const SELECT_FOOD = `
  SELECT * FROM foods
  WHERE deleted_at IS NULL
`;

/**
 * Ricerca per sottostringa sul nome normalizzato (accenti e maiuscole ignorati).
 * Termine vuoto = tutti. Ordine: preferiti, poi più usati, poi alfabetico.
 */
export async function searchFoods(
  term: string,
  limit = 50,
): Promise<FoodRow[]> {
  const db = await getDb();
  const normalized = normalizeText(term);
  const order = "ORDER BY is_favorite DESC, usage_count DESC, name ASC LIMIT ?";

  if (normalized === "") {
    return db.getAllAsync<FoodRow>(`${SELECT_FOOD} ${order}`, [limit]);
  }
  return db.getAllAsync<FoodRow>(
    `${SELECT_FOOD} AND name_norm LIKE ? ${order}`,
    [`%${normalized}%`, limit],
  );
}

export async function getFood(id: string): Promise<FoodRow | null> {
  const db = await getDb();
  return db.getFirstAsync<FoodRow>(`${SELECT_FOOD} AND id = ?`, [id]);
}

export async function getFoodByBarcode(
  barcode: string,
): Promise<FoodRow | null> {
  const db = await getDb();
  return db.getFirstAsync<FoodRow>(`${SELECT_FOOD} AND barcode = ?`, [barcode]);
}

export async function createFood(input: FoodInput): Promise<string> {
  const db = await getDb();
  const id = newId();
  const now = nowIso();
  const n = input.nutrients;

  await db.runAsync(
    `INSERT INTO foods (
       id, name, name_norm, brand, source, barcode, off_id,
       kcal, protein, carbs, sugars, fat, saturated_fat, fiber, salt,
       is_liquid, default_serving_g, serving_label, image_uri,
       is_favorite, usage_count, is_estimated, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?)`,
    [
      id,
      input.name,
      normalizeText(input.name),
      input.brand ?? null,
      input.source ?? "user",
      input.barcode ?? null,
      input.offId ?? null,
      n.kcal,
      n.protein,
      n.carbs,
      n.sugars,
      n.fat,
      n.saturatedFat,
      n.fiber,
      n.salt,
      input.isLiquid ? 1 : 0,
      input.defaultServingG ?? null,
      input.servingLabel ?? null,
      input.imageUri ?? null,
      input.isEstimated ? 1 : 0,
      now,
      now,
    ],
  );
  return id;
}

export async function updateFood(id: string, input: FoodInput): Promise<void> {
  const db = await getDb();
  const n = input.nutrients;

  await db.runAsync(
    `UPDATE foods SET
       name = ?, name_norm = ?, brand = ?, barcode = ?, off_id = ?,
       kcal = ?, protein = ?, carbs = ?, sugars = ?, fat = ?,
       saturated_fat = ?, fiber = ?, salt = ?,
       is_liquid = ?, default_serving_g = ?, serving_label = ?, image_uri = ?,
       is_estimated = ?, updated_at = ?
     WHERE id = ?`,
    [
      input.name,
      normalizeText(input.name),
      input.brand ?? null,
      input.barcode ?? null,
      input.offId ?? null,
      n.kcal,
      n.protein,
      n.carbs,
      n.sugars,
      n.fat,
      n.saturatedFat,
      n.fiber,
      n.salt,
      input.isLiquid ? 1 : 0,
      input.defaultServingG ?? null,
      input.servingLabel ?? null,
      input.imageUri ?? null,
      input.isEstimated ? 1 : 0,
      nowIso(),
      id,
    ],
  );
}

/**
 * Cancellazione logica: le meal_entries storiche continuano a referenziare la
 * riga, e il loro snapshot dei macro resta comunque intatto.
 */
export async function deleteFood(id: string): Promise<void> {
  const db = await getDb();
  const now = nowIso();
  await db.runAsync(
    "UPDATE foods SET deleted_at = ?, updated_at = ? WHERE id = ?",
    [now, now, id],
  );
}

export async function toggleFoodFavorite(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    "UPDATE foods SET is_favorite = 1 - is_favorite, updated_at = ? WHERE id = ?",
    [nowIso(), id],
  );
}

export async function incrementFoodUsage(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    "UPDATE foods SET usage_count = usage_count + 1, updated_at = ? WHERE id = ?",
    [nowIso(), id],
  );
}
```

- [ ] **Step 9: Eseguire i test**

Run: `npx jest src/db/queries/foods.test.ts`
Atteso: PASS. Rimuovere dal test di `deleteFood` le due righe segnaposto (`const db = createTestDb; expect(db).toBeDefined();`) sostituendole con una verifica reale: interrogare direttamente la connessione di test per confermare che la riga esiste ancora con `deleted_at` valorizzato. Per farlo, tenere il riferimento al `db` creato nel `beforeEach` in una variabile di modulo.

- [ ] **Step 10: Scrivere il seed alimenti**

`src/db/seed/foods.ts` esporta un array tipizzato. Valori per 100 g di prodotto crudo salvo diversa indicazione nel nome, presi da tabelle CREA/USDA.

```ts
import type { Nutrients } from "@/src/domain/nutrition";

export interface SeedFood {
  /** Id stabile: permette di riconoscere il seed già inserito e di aggiornarlo. */
  id: string;
  name: string;
  nutrients: Nutrients;
  isLiquid?: boolean;
  defaultServingG?: number;
  servingLabel?: string;
}

const f = (
  kcal: number,
  protein: number,
  carbs: number,
  fat: number,
  extra: Partial<Nutrients> = {},
): Nutrients => ({
  kcal,
  protein,
  carbs,
  fat,
  sugars: 0,
  saturatedFat: 0,
  fiber: 0,
  salt: 0,
  ...extra,
});

export const SEED_FOODS: SeedFood[] = [
  // Cereali e derivati
  { id: "seed-riso-bianco", name: "Riso bianco crudo", nutrients: f(358, 7, 79, 0.6, { fiber: 1.4 }) },
  { id: "seed-pasta-semola", name: "Pasta di semola cruda", nutrients: f(353, 12, 71, 1.5, { fiber: 2.7 }) },
  { id: "seed-pane-bianco", name: "Pane bianco", nutrients: f(275, 8.6, 55, 1.2, { fiber: 3.2, salt: 1.3 }) },
  { id: "seed-fiocchi-avena", name: "Fiocchi d'avena", nutrients: f(389, 16.9, 66, 6.9, { fiber: 10.6 }) },
  // Carni
  { id: "seed-petto-pollo", name: "Petto di pollo crudo", nutrients: f(165, 31, 0, 3.6, { saturatedFat: 1 }) },
  { id: "seed-fesa-tacchino", name: "Fesa di tacchino cruda", nutrients: f(135, 30, 0, 1.6) },
  { id: "seed-manzo-magro", name: "Manzo magro crudo", nutrients: f(158, 21, 0, 8) },
  // Pesce
  { id: "seed-salmone", name: "Salmone crudo", nutrients: f(208, 20, 0, 13, { saturatedFat: 3.1 }) },
  { id: "seed-tonno-naturale", name: "Tonno al naturale sgocciolato", nutrients: f(116, 26, 0, 1, { salt: 0.9 }) },
  // Uova e latticini
  { id: "seed-uovo", name: "Uovo intero", nutrients: f(143, 12.6, 0.7, 9.5, { saturatedFat: 3.1 }), defaultServingG: 55, servingLabel: "1 uovo medio = 55 g" },
  { id: "seed-albume", name: "Albume", nutrients: f(52, 11, 0.7, 0.2) },
  { id: "seed-yogurt-greco-0", name: "Yogurt greco 0%", nutrients: f(57, 10, 3.6, 0.4, { sugars: 3.6 }), defaultServingG: 150, servingLabel: "1 vasetto = 150 g" },
  { id: "seed-latte-parz", name: "Latte parzialmente scremato", nutrients: f(46, 3.3, 5, 1.5, { sugars: 5 }), isLiquid: true, defaultServingG: 200 },
  { id: "seed-parmigiano", name: "Parmigiano Reggiano", nutrients: f(392, 33, 0, 28.5, { saturatedFat: 19, salt: 1.6 }) },
  // Legumi
  { id: "seed-lenticchie-secche", name: "Lenticchie secche", nutrients: f(353, 25, 60, 1.1, { fiber: 30.5 }) },
  { id: "seed-ceci-lessati", name: "Ceci lessati", nutrients: f(120, 7, 18, 2.4, { fiber: 5 }) },
  // Verdura e frutta
  { id: "seed-zucchine", name: "Zucchine", nutrients: f(17, 1.2, 3.1, 0.3, { fiber: 1 }) },
  { id: "seed-pomodori", name: "Pomodori", nutrients: f(18, 0.9, 3.9, 0.2, { sugars: 2.6, fiber: 1.2 }) },
  { id: "seed-banana", name: "Banana", nutrients: f(89, 1.1, 23, 0.3, { sugars: 12, fiber: 2.6 }), defaultServingG: 120, servingLabel: "1 banana media = 120 g" },
  { id: "seed-mela", name: "Mela", nutrients: f(52, 0.3, 14, 0.2, { sugars: 10, fiber: 2.4 }), defaultServingG: 150 },
  // Frutta secca, oli e grassi
  { id: "seed-mandorle", name: "Mandorle", nutrients: f(579, 21, 22, 50, { fiber: 12.5 }) },
  { id: "seed-olio-evo", name: "Olio extravergine di oliva", nutrients: f(884, 0, 0, 100, { saturatedFat: 14 }), isLiquid: true, defaultServingG: 10, servingLabel: "1 cucchiaio = 10 g" },
  { id: "seed-burro-arachidi", name: "Burro di arachidi", nutrients: f(588, 25, 20, 50, { fiber: 6 }) },
];
```

Completare l'array fino ad almeno **150 alimenti**, coprendo tutte queste categorie con il numero minimo indicato: cereali e derivati (20), carni (15), pesce (12), uova e latticini (20), legumi (10), verdura (25), frutta (20), frutta secca e semi (10), oli e grassi (6), dolci e snack (8), bevande (8). Regole: nomi in italiano, valori per 100 g di prodotto crudo salvo diversa indicazione esplicita nel nome, `defaultServingG` valorizzato solo dove la porzione è un'unità naturale (un uovo, una banana, un vasetto, un cucchiaio).

- [ ] **Step 11: Scrivere `src/db/seed/index.ts`**

Idempotente: l'id stabile permette di rieseguirlo a ogni avvio senza duplicare. Aggiorna i valori se il seed cambia, ma **non** tocca gli alimenti che l'utente ha modificato o cancellato.

```ts
import { getDb } from "@/src/db/index";
import { nowIso } from "@/src/db/ids";
import { SEED_FOODS } from "@/src/db/seed/foods";
import { normalizeText } from "@/src/domain/text";
import { logger } from "@/src/utils/logger";

/**
 * Inserisce gli alimenti di seed mancanti. Gli id sono stabili, quindi la
 * funzione è idempotente. Non aggiorna e non resuscita le righe già presenti:
 * se l'utente ha corretto un valore o cancellato un alimento, la sua scelta vince.
 */
export async function applySeeds(): Promise<void> {
  const db = await getDb();
  const existing = await db.getAllAsync<{ id: string }>("SELECT id FROM foods");
  const present = new Set(existing.map((r) => r.id));
  const missing = SEED_FOODS.filter((food) => !present.has(food.id));
  if (missing.length === 0) return;

  const now = nowIso();
  await db.withTransactionAsync(async () => {
    for (const food of missing) {
      const n = food.nutrients;
      await db.runAsync(
        `INSERT INTO foods (
           id, name, name_norm, source,
           kcal, protein, carbs, sugars, fat, saturated_fat, fiber, salt,
           is_liquid, default_serving_g, serving_label,
           is_favorite, usage_count, is_estimated, created_at, updated_at
         ) VALUES (?, ?, ?, 'seed', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?)`,
        [
          food.id,
          food.name,
          normalizeText(food.name),
          n.kcal,
          n.protein,
          n.carbs,
          n.sugars,
          n.fat,
          n.saturatedFat,
          n.fiber,
          n.salt,
          food.isLiquid ? 1 : 0,
          food.defaultServingG ?? null,
          food.servingLabel ?? null,
          now,
          now,
        ],
      );
    }
  });
  logger.info(`[db] ${missing.length} alimenti di seed inseriti`);
}
```

Chiamare `applySeeds()` in `initDatabase()`, dopo `runMigrations()`.

- [ ] **Step 12: Aggiungere il test del seed**

In `src/db/seed/seed.test.ts`:

```ts
import { createTestDb } from "@/src/db/__testing__/betterSqliteAdapter";
import { __setDbForTesting } from "@/src/db/index";
import { runMigrations } from "@/src/db/migrations";
import { deleteFood } from "@/src/db/queries/foods";
import { applySeeds } from "@/src/db/seed";
import { SEED_FOODS } from "@/src/db/seed/foods";
import type { LocalDatabase } from "@/src/db/sqliteAdapter";

let db: LocalDatabase;

beforeEach(async () => {
  db = createTestDb();
  await runMigrations(db);
  __setDbForTesting(db);
});

afterEach(() => __setDbForTesting(null));

const countFoods = async (): Promise<number> => {
  const row = await db.getFirstAsync<{ n: number }>(
    "SELECT COUNT(*) AS n FROM foods",
  );
  return row?.n ?? 0;
};

describe("applySeeds", () => {
  it("inserisce tutti gli alimenti di seed", async () => {
    await applySeeds();
    expect(await countFoods()).toBe(SEED_FOODS.length);
  });

  it("è idempotente", async () => {
    await applySeeds();
    await applySeeds();
    expect(await countFoods()).toBe(SEED_FOODS.length);
  });

  it("non resuscita un alimento di seed cancellato dall'utente", async () => {
    await applySeeds();
    await deleteFood(SEED_FOODS[0].id);
    await applySeeds();

    const row = await db.getFirstAsync<{ deleted_at: string | null }>(
      "SELECT deleted_at FROM foods WHERE id = ?",
      [SEED_FOODS[0].id],
    );
    expect(row?.deleted_at).not.toBeNull();
  });

  it("gli id di seed sono unici", () => {
    expect(new Set(SEED_FOODS.map((f) => f.id)).size).toBe(SEED_FOODS.length);
  });

  it("nessun alimento di seed ha calorie incoerenti con i macro", () => {
    for (const food of SEED_FOODS) {
      const { kcal, protein, carbs, fat } = food.nutrients;
      const fromMacros = protein * 4 + carbs * 4 + fat * 9;
      // Tolleranza ampia: fibra, alcol e arrotondamenti delle tabelle.
      expect(Math.abs(fromMacros - kcal)).toBeLessThan(kcal * 0.25 + 25);
    }
  });
});
```

Il test sulla coerenza calorie/macro serve a intercettare errori di battitura nei 150 valori inseriti a mano.

- [ ] **Step 13: Costruire le schermate alimenti**

`FoodsScreen.tsx` - lista con `SearchBar` in alto, `FlatList` di `FoodListItem`, `EmptyState` quando la ricerca non trova nulla, FAB in basso a destra (ancorato con `useSafeAreaInsets`) che apre `FoodFormScreen`. I dati arrivano da `useFocusData(() => searchFoods(term))`; la ricerca è debounced a 250 ms.

`FoodListItem.tsx` (`containers/foods/`) - `TouchableOpacity` con `activeOpacity={0.6}`: nome, marca sotto, kcal per 100 g a destra, stella preferito con `hitSlop={8}`.

`FoodFormScreen.tsx` - `DfForm` con `DfInput` nome e marca, `NutrientFields` per gli otto valori, `DfSwitch` liquido, `DfNumberInput` porzione di default e `DfInput` etichetta porzione. In modifica mostra anche l'eliminazione, con conferma via `DfAlert`.

`NutrientFields.tsx` (`containers/foods/`) - gli otto `DfNumberInput` con le rispettive unità, kcal in evidenza e un aiuto sotto che mostra le kcal ricalcolate dai macro con `kcalFromMacros`, così una battitura sbagliata si vede subito.

Registrare `Foods` e `FoodForm` nel RootStack e in `NavParams`. `FoodForm` prende `{ id?: string }`.

Aggiungere le chiavi i18n in `it.json` e `en.json` sotto `foods`.

- [ ] **Step 14: Gate**

```bash
npm run typecheck && npm run lint && npm test && npm run android
```

- [ ] **Step 15: Screenshot**

Catturare: lista alimenti popolata dal seed, ricerca con risultati, ricerca senza risultati (stato vuoto), form di creazione, form di modifica.

```bash
adb exec-out screencap -p > /tmp/kaltrack-task5-list.png
adb exec-out screencap -p > /tmp/kaltrack-task5-search.png
adb exec-out screencap -p > /tmp/kaltrack-task5-empty.png
adb exec-out screencap -p > /tmp/kaltrack-task5-form.png
```

Verificare: il seed compare, la ricerca "caffe" trova "Caffè", il FAB non finisce sotto la barra di sistema, i campi numerici aprono il tastierino numerico.

- [ ] **Step 16: Commit**

```bash
git add -A
git commit -m "Add the food catalogue: seed, CRUD and search

Foods are one table for both raw ingredients and branded products,
distinguished by a source column, so a single search covers everything
the user can log.

Search matches on a normalised name column added in migration 003 and
maintained on every write: lowercase, accents stripped, punctuation
removed. Typing 'caffe' finds 'Caffè', which SQLite's ASCII-only LIKE
would otherwise miss. The same normaliser will back voice matching in
Phase 2. Results are ordered favourites first, then by usage count, so
the foods actually eaten surface without scrolling.

Deletion is logical: historical meal entries still reference the row,
and their macro snapshot stays intact regardless.

The seed ships 150 common Italian foods with stable ids, applied
idempotently at startup. It never updates or resurrects an existing row,
so a value the user corrected or a food they deleted stays their way. A
test cross-checks every seeded item's calories against its macros to
catch typos in hand-entered data.

Query tests run against a real in-memory SQLite through the test
adapter, so the SQL itself is covered rather than mocked."
```

---

## Task 6: Ricette (i pasti custom)

**Files:**
- Create: `src/db/queries/recipes.ts`, `src/db/queries/recipes.test.ts`, `src/navigation/screens/RecipesScreen.tsx`, `src/navigation/screens/RecipeFormScreen.tsx`, `src/containers/recipes/RecipeListItem.tsx`, `src/containers/recipes/IngredientRow.tsx`, `src/containers/recipes/IngredientPicker.tsx`, `src/containers/recipes/NutritionSummary.tsx`
- Modify: `src/types/nutrition.ts`, `src/navigation/index.tsx`, `src/hooks/useAppNav.ts`, i due file i18n, `package.json` (expo-image-picker)

**Interfaces:**
- Consumes: `RecipeNode`, `RecipeItemNode`, `recipeTotals`, `recipePerServing`, `foodNutrients`, `getFood`, `normalizeText`
- Produces:
  - `RecipeRow`, `RecipeItemRow`
  - `RecipeItemInput` = `{ foodId: string; quantityG: number } | { childRecipeId: string; servings: number }`
  - `RecipeInput` = `{ name: string; servings: number; photoUri?: string | null; notes?: string | null; items: RecipeItemInput[] }`
  - `searchRecipes(term: string, limit?: number): Promise<RecipeRow[]>`
  - `getRecipe(id: string): Promise<RecipeRow | null>`
  - `getRecipeItems(recipeId: string): Promise<RecipeItemRow[]>`
  - `buildRecipeTree(recipeId: string): Promise<RecipeNode | null>`
  - `createRecipe(input: RecipeInput): Promise<string>`
  - `updateRecipe(id: string, input: RecipeInput): Promise<void>`
  - `deleteRecipe(id: string): Promise<void>`
  - `incrementRecipeUsage(id: string): Promise<void>`
  - `RecipeCycleError`, `MAX_RECIPE_DEPTH = 3`

- [ ] **Step 1: Installare expo-image-picker**

```bash
npx expo install expo-image-picker
```

Aggiungere in `app.json` il plugin con la stringa di permesso in italiano per la galleria.

- [ ] **Step 2: Scrivere `src/db/queries/recipes.test.ts` (fallisce)**

I casi che contano davvero sono l'annidamento e i cicli.

```ts
import { createTestDb } from "@/src/db/__testing__/betterSqliteAdapter";
import { __setDbForTesting } from "@/src/db/index";
import { runMigrations } from "@/src/db/migrations";
import { createFood } from "@/src/db/queries/foods";
import {
  buildRecipeTree,
  createRecipe,
  deleteRecipe,
  getRecipeItems,
  MAX_RECIPE_DEPTH,
  RecipeCycleError,
  searchRecipes,
  updateRecipe,
} from "@/src/db/queries/recipes";
import { EMPTY_NUTRIENTS, recipePerServing, recipeTotals } from "@/src/domain/nutrition";

let riceId: string;
let chickenId: string;

beforeEach(async () => {
  const db = createTestDb();
  await runMigrations(db);
  __setDbForTesting(db);
  riceId = await createFood({
    name: "Riso",
    nutrients: { ...EMPTY_NUTRIENTS, kcal: 358, protein: 7, carbs: 79, fat: 0.6 },
  });
  chickenId = await createFood({
    name: "Pollo",
    nutrients: { ...EMPTY_NUTRIENTS, kcal: 165, protein: 31, fat: 3.6 },
  });
});

afterEach(() => __setDbForTesting(null));

describe("createRecipe", () => {
  it("salva ricetta e ingredienti", async () => {
    const id = await createRecipe({
      name: "Pollo e riso",
      servings: 2,
      items: [
        { foodId: riceId, quantityG: 200 },
        { foodId: chickenId, quantityG: 300 },
      ],
    });

    expect(await getRecipeItems(id)).toHaveLength(2);
  });

  it("mantiene l'ordine degli ingredienti", async () => {
    const id = await createRecipe({
      name: "Ordinata",
      servings: 1,
      items: [
        { foodId: chickenId, quantityG: 100 },
        { foodId: riceId, quantityG: 100 },
      ],
    });
    const items = await getRecipeItems(id);
    expect(items[0].food_id).toBe(chickenId);
    expect(items[1].food_id).toBe(riceId);
  });
});

describe("buildRecipeTree", () => {
  it("costruisce l'albero con i valori degli alimenti", async () => {
    const id = await createRecipe({
      name: "Pollo e riso",
      servings: 2,
      items: [
        { foodId: riceId, quantityG: 200 },
        { foodId: chickenId, quantityG: 300 },
      ],
    });

    const tree = await buildRecipeTree(id);
    expect(tree).not.toBeNull();
    expect(recipeTotals(tree!).kcal).toBeCloseTo(358 * 2 + 165 * 3);
    expect(recipePerServing(tree!).kcal).toBeCloseTo((358 * 2 + 165 * 3) / 2);
  });

  it("risolve le ricette annidate", async () => {
    const baseId = await createRecipe({
      name: "Base riso",
      servings: 4,
      items: [{ foodId: riceId, quantityG: 400 }],
    });
    const outerId = await createRecipe({
      name: "Piatto completo",
      servings: 1,
      items: [
        { childRecipeId: baseId, servings: 2 },
        { foodId: chickenId, quantityG: 100 },
      ],
    });

    const tree = await buildRecipeTree(outerId);
    expect(recipeTotals(tree!).kcal).toBeCloseTo(358 * 2 + 165);
  });

  it("ignora gli ingredienti il cui alimento è stato cancellato", async () => {
    const id = await createRecipe({
      name: "Con buco",
      servings: 1,
      items: [{ foodId: riceId, quantityG: 100 }],
    });
    const db = await import("@/src/db/index").then((m) => m.getDb());
    await db.runAsync("UPDATE foods SET deleted_at = ? WHERE id = ?", [
      "2026-01-01T00:00:00.000Z",
      riceId,
    ]);

    // L'alimento non c'è più: la ricetta resta valida ma senza quella riga.
    const tree = await buildRecipeTree(id);
    expect(tree!.items).toHaveLength(0);
  });

  it("su ricetta inesistente ritorna null", async () => {
    expect(await buildRecipeTree("non-esiste")).toBeNull();
  });
});

describe("protezione dai cicli", () => {
  it("rifiuta una ricetta che contiene se stessa", async () => {
    const id = await createRecipe({ name: "A", servings: 1, items: [] });
    await expect(
      updateRecipe(id, {
        name: "A",
        servings: 1,
        items: [{ childRecipeId: id, servings: 1 }],
      }),
    ).rejects.toBeInstanceOf(RecipeCycleError);
  });

  it("rifiuta un ciclo indiretto A -> B -> A", async () => {
    const aId = await createRecipe({ name: "A", servings: 1, items: [] });
    const bId = await createRecipe({
      name: "B",
      servings: 1,
      items: [{ childRecipeId: aId, servings: 1 }],
    });

    await expect(
      updateRecipe(aId, {
        name: "A",
        servings: 1,
        items: [{ childRecipeId: bId, servings: 1 }],
      }),
    ).rejects.toBeInstanceOf(RecipeCycleError);
  });

  it("rifiuta un annidamento più profondo del limite", async () => {
    let previous = await createRecipe({ name: "L0", servings: 1, items: [] });
    for (let level = 1; level <= MAX_RECIPE_DEPTH; level++) {
      previous = await createRecipe({
        name: `L${level}`,
        servings: 1,
        items: [{ childRecipeId: previous, servings: 1 }],
      });
    }
    await expect(
      createRecipe({
        name: "troppo profonda",
        servings: 1,
        items: [{ childRecipeId: previous, servings: 1 }],
      }),
    ).rejects.toThrow();
  });
});

describe("searchRecipes", () => {
  it("cerca ignorando accenti e maiuscole", async () => {
    await createRecipe({ name: "Purè di patate", servings: 2, items: [] });
    expect((await searchRecipes("PURE")).map((r) => r.name)).toEqual([
      "Purè di patate",
    ]);
  });

  it("non ritorna le ricette cancellate", async () => {
    const id = await createRecipe({ name: "Vecchia", servings: 1, items: [] });
    await deleteRecipe(id);
    expect(await searchRecipes("vecchia")).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Eseguire per vederlo fallire**

Run: `npx jest src/db/queries/recipes.test.ts`
Atteso: FAIL.

- [ ] **Step 4: Scrivere `src/db/queries/recipes.ts`**

Il pezzo delicato è la costruzione dell'albero: deve fermarsi sia sui cicli sia sulla profondità, e la validazione va fatta **prima** di scrivere, non dopo.

```ts
import { getDb } from "@/src/db/index";
import { newId, nowIso } from "@/src/db/ids";
import type { RecipeItemNode, RecipeNode } from "@/src/domain/nutrition";
import { normalizeText } from "@/src/domain/text";
import { foodNutrients, type FoodRow } from "@/src/types/nutrition";
import type { RecipeInput, RecipeItemRow, RecipeRow } from "@/src/types/nutrition";

export const MAX_RECIPE_DEPTH = 3;

export class RecipeCycleError extends Error {
  constructor(message = "La ricetta non può contenere se stessa") {
    super(message);
    this.name = "RecipeCycleError";
  }
}

export class RecipeDepthError extends Error {
  constructor(message = "Annidamento delle ricette troppo profondo") {
    super(message);
    this.name = "RecipeDepthError";
  }
}

const SELECT_RECIPE = "SELECT * FROM recipes WHERE deleted_at IS NULL";

export async function searchRecipes(
  term: string,
  limit = 50,
): Promise<RecipeRow[]> {
  const db = await getDb();
  const normalized = normalizeText(term);
  const order = "ORDER BY is_favorite DESC, usage_count DESC, name ASC LIMIT ?";
  if (normalized === "") {
    return db.getAllAsync<RecipeRow>(`${SELECT_RECIPE} ${order}`, [limit]);
  }
  return db.getAllAsync<RecipeRow>(
    `${SELECT_RECIPE} AND name_norm LIKE ? ${order}`,
    [`%${normalized}%`, limit],
  );
}

export async function getRecipe(id: string): Promise<RecipeRow | null> {
  const db = await getDb();
  return db.getFirstAsync<RecipeRow>(`${SELECT_RECIPE} AND id = ?`, [id]);
}

export async function getRecipeItems(
  recipeId: string,
): Promise<RecipeItemRow[]> {
  const db = await getDb();
  return db.getAllAsync<RecipeItemRow>(
    "SELECT * FROM recipe_items WHERE recipe_id = ? AND deleted_at IS NULL ORDER BY sort ASC",
    [recipeId],
  );
}

/**
 * Costruisce l'albero nutrizionale della ricetta risolvendo gli annidamenti.
 * Gli ingredienti il cui alimento è stato cancellato vengono saltati: la ricetta
 * resta usabile invece di diventare irrecuperabile.
 */
export async function buildRecipeTree(
  recipeId: string,
  visited: Set<string> = new Set(),
  depth = 0,
): Promise<RecipeNode | null> {
  if (depth > MAX_RECIPE_DEPTH) throw new RecipeDepthError();
  if (visited.has(recipeId)) throw new RecipeCycleError();

  const recipe = await getRecipe(recipeId);
  if (!recipe) return null;

  const nextVisited = new Set(visited).add(recipeId);
  const rows = await getRecipeItems(recipeId);
  const items: RecipeItemNode[] = [];

  for (const row of rows) {
    if (row.food_id) {
      const db = await getDb();
      const food = await db.getFirstAsync<FoodRow>(
        "SELECT * FROM foods WHERE id = ? AND deleted_at IS NULL",
        [row.food_id],
      );
      if (!food) continue;
      items.push({
        kind: "food",
        per100: foodNutrients(food),
        grams: row.quantity_g ?? 0,
      });
    } else if (row.child_recipe_id) {
      const child = await buildRecipeTree(
        row.child_recipe_id,
        nextVisited,
        depth + 1,
      );
      if (!child) continue;
      items.push({ kind: "recipe", child, servings: row.servings ?? 0 });
    }
  }

  return { servings: recipe.servings, items };
}

/**
 * Verifica che aggiungere questi figli a `recipeId` non crei un ciclo né superi
 * la profondità massima. Va chiamata PRIMA di scrivere.
 */
async function assertNoCycle(
  recipeId: string | null,
  items: RecipeInput["items"],
): Promise<void> {
  for (const item of items) {
    if (!("childRecipeId" in item)) continue;
    if (item.childRecipeId === recipeId) throw new RecipeCycleError();
    const seen = recipeId ? new Set([recipeId]) : new Set<string>();
    await buildRecipeTree(item.childRecipeId, seen, 1);
  }
}

export async function createRecipe(input: RecipeInput): Promise<string> {
  await assertNoCycle(null, input.items);
  const db = await getDb();
  const id = newId();
  const now = nowIso();

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO recipes (id, name, name_norm, photo_uri, servings, notes,
         is_favorite, usage_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, ?)`,
      [
        id,
        input.name,
        normalizeText(input.name),
        input.photoUri ?? null,
        input.servings,
        input.notes ?? null,
        now,
        now,
      ],
    );
    await insertItems(id, input.items, now);
  });
  return id;
}

export async function updateRecipe(
  id: string,
  input: RecipeInput,
): Promise<void> {
  await assertNoCycle(id, input.items);
  const db = await getDb();
  const now = nowIso();

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE recipes SET name = ?, name_norm = ?, photo_uri = ?, servings = ?,
         notes = ?, updated_at = ? WHERE id = ?`,
      [
        input.name,
        normalizeText(input.name),
        input.photoUri ?? null,
        input.servings,
        input.notes ?? null,
        now,
        id,
      ],
    );
    // Gli ingredienti si riscrivono per intero: sono un dettaglio della ricetta,
    // niente li referenzia dall'esterno.
    await db.runAsync("DELETE FROM recipe_items WHERE recipe_id = ?", [id]);
    await insertItems(id, input.items, now);
  });
}

async function insertItems(
  recipeId: string,
  items: RecipeInput["items"],
  now: string,
): Promise<void> {
  const db = await getDb();
  let sort = 0;
  for (const item of items) {
    const isFood = "foodId" in item;
    await db.runAsync(
      `INSERT INTO recipe_items (id, recipe_id, food_id, child_recipe_id,
         quantity_g, servings, sort, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newId(),
        recipeId,
        isFood ? item.foodId : null,
        isFood ? null : item.childRecipeId,
        isFood ? item.quantityG : null,
        isFood ? null : item.servings,
        sort++,
        now,
        now,
      ],
    );
  }
}

export async function deleteRecipe(id: string): Promise<void> {
  const db = await getDb();
  const now = nowIso();
  await db.runAsync(
    "UPDATE recipes SET deleted_at = ?, updated_at = ? WHERE id = ?",
    [now, now, id],
  );
}

export async function incrementRecipeUsage(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    "UPDATE recipes SET usage_count = usage_count + 1, updated_at = ? WHERE id = ?",
    [nowIso(), id],
  );
}
```

Aggiungere `RecipeRow`, `RecipeItemRow`, `RecipeItemInput` e `RecipeInput` a `src/types/nutrition.ts`, con la stessa forma snake_case delle colonne per le righe e camelCase per gli input.

- [ ] **Step 5: Eseguire i test**

Run: `npx jest src/db/queries/recipes.test.ts`
Atteso: PASS.

- [ ] **Step 6: Costruire le schermate ricette**

`RecipesScreen.tsx` - lista con ricerca, `RecipeListItem` mostra nome, foto miniatura (`DfImage`), kcal a porzione, numero ingredienti. FAB per creare.

`RecipeFormScreen.tsx` - nome, porzioni (`DfNumberInput`), foto (`expo-image-picker`, camera o galleria, con anteprima e rimozione), note, lista ingredienti riordinabile con eliminazione, bottone "Aggiungi ingrediente" che apre `IngredientPicker`.

`IngredientPicker.tsx` - bottom sheet (`DfBottomSheet`) con due tab: alimenti e le altre ricette. Selezionato l'elemento chiede la quantità (grammi per un alimento, porzioni per una ricetta), precompilata con `default_serving_g` quando presente.

`NutritionSummary.tsx` - riquadro sempre visibile in fondo al form che mostra i totali e i valori a porzione, ricalcolati a ogni modifica con `recipeTotals`/`recipePerServing` sull'albero costruito in memoria dagli ingredienti correnti (senza passare dal DB, così aggiorna mentre si digita).

Errori: `RecipeCycleError` e `RecipeDepthError` vanno intercettati nel salvataggio e mostrati come toast comprensibile, non come crash.

- [ ] **Step 7: Gate + screenshot**

```bash
npm run typecheck && npm run lint && npm test && npm run android
adb exec-out screencap -p > /tmp/kaltrack-task6-list.png
adb exec-out screencap -p > /tmp/kaltrack-task6-form.png
adb exec-out screencap -p > /tmp/kaltrack-task6-picker.png
```

Verificare: i totali nel riepilogo cambiano mentre si modifica una quantità, la foto si vede, il bottom sheet non finisce sotto la barra di sistema.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "Add custom recipes with nested ingredients

Recipes are the user's own meals: a name, a photo, a serving count and a
list of ingredients. Nutrition is always derived, never stored, so
correcting an ingredient's values updates every recipe that uses it.

An ingredient can reference another recipe rather than a food, which is
what makes 'my protein pizza' usable inside a larger meal. Nested
recipes contribute by servings while foods contribute by grams, keeping
the unit unambiguous at each level.

Nesting is guarded on write, not on read: assertNoCycle walks the
prospective tree before any row is written, so a self-reference or an
indirect A -> B -> A loop is rejected with a typed error the form turns
into a readable message, and depth is capped at three levels. Building
the tree skips ingredients whose food was deleted rather than failing,
so removing an ingredient never makes a recipe unopenable.

Ingredients are rewritten wholesale on update since nothing outside the
recipe references them."
```

---

## Task 7: Diario dei pasti

Il cuore dell'app: la schermata Oggi.

**Files:**
- Create: `src/db/queries/diary.ts`, `src/db/queries/diary.test.ts`, `src/containers/diary/DayHeader.tsx`, `src/containers/diary/MealSection.tsx`, `src/containers/diary/EntryRow.tsx`, `src/containers/diary/AddEntrySheet.tsx`, `src/containers/diary/QuantitySheet.tsx`, `src/navigation/screens/MealTypesScreen.tsx`
- Modify: `src/navigation/screens/TodayScreen.tsx`, `src/types/nutrition.ts`, `src/navigation/index.tsx`, `src/hooks/useAppNav.ts`, i due file i18n

**Interfaces:**
- Consumes: `Nutrients`, `sumNutrients`, `scaleNutrients`, `recipePerServing`, `buildRecipeTree`, `foodNutrients`, `todayIso`, `addDays`, `dayLabelKind`
- Produces:
  - `MealTypeRow`, `MealRow`, `MealEntryRow`
  - `DayDiary` = `{ date: string; meals: DiaryMeal[]; totals: Nutrients }`
  - `DiaryMeal` = `{ meal: MealRow; type: MealTypeRow; entries: MealEntryRow[]; totals: Nutrients }`
  - `getDayDiary(date: string): Promise<DayDiary>`
  - `addFoodEntry(args: { date: string; mealTypeId: string; foodId: string; quantityG: number; createdVia?: string }): Promise<string>`
  - `addRecipeEntry(args: { date: string; mealTypeId: string; recipeId: string; servings: number; createdVia?: string }): Promise<string>`
  - `addFreeEntry(args: { date: string; mealTypeId: string; label: string; nutrients: Nutrients; isEstimated?: boolean; confidence?: number; note?: string; photoUri?: string; createdVia?: string }): Promise<string>`
  - `updateEntryQuantity(entryId: string, quantity: number): Promise<void>`
  - `deleteEntry(entryId: string): Promise<void>`
  - `copyDay(fromDate: string, toDate: string): Promise<void>`
  - `listMealTypes(): Promise<MealTypeRow[]>`, `createMealType`, `renameMealType`, `deleteMealType`

- [ ] **Step 1: Scrivere `src/db/queries/diary.test.ts` (fallisce)**

I casi che contano: lo snapshot dei macro, il ricalcolo alla modifica della quantità, l'aggregazione del giorno.

```ts
import { createTestDb } from "@/src/db/__testing__/betterSqliteAdapter";
import { __setDbForTesting } from "@/src/db/index";
import { MEAL_TYPE_IDS, runMigrations } from "@/src/db/migrations";
import {
  addFoodEntry,
  addFreeEntry,
  addRecipeEntry,
  copyDay,
  deleteEntry,
  getDayDiary,
  updateEntryQuantity,
} from "@/src/db/queries/diary";
import { createFood, updateFood } from "@/src/db/queries/foods";
import { createRecipe } from "@/src/db/queries/recipes";
import { EMPTY_NUTRIENTS } from "@/src/domain/nutrition";

const DATE = "2026-08-28";
let riceId: string;

beforeEach(async () => {
  const db = createTestDb();
  await runMigrations(db);
  __setDbForTesting(db);
  riceId = await createFood({
    name: "Riso",
    nutrients: { ...EMPTY_NUTRIENTS, kcal: 358, protein: 7, carbs: 79, fat: 0.6 },
  });
});

afterEach(() => __setDbForTesting(null));

describe("addFoodEntry", () => {
  it("crea il pasto se non esiste e vi aggiunge la riga", async () => {
    await addFoodEntry({
      date: DATE,
      mealTypeId: MEAL_TYPE_IDS.lunch,
      foodId: riceId,
      quantityG: 100,
    });

    const diary = await getDayDiary(DATE);
    expect(diary.meals).toHaveLength(1);
    expect(diary.meals[0].entries).toHaveLength(1);
    expect(diary.totals.kcal).toBeCloseTo(358);
  });

  it("riusa il pasto esistente dello stesso tipo e giorno", async () => {
    for (const grams of [100, 50]) {
      await addFoodEntry({
        date: DATE,
        mealTypeId: MEAL_TYPE_IDS.lunch,
        foodId: riceId,
        quantityG: grams,
      });
    }

    const diary = await getDayDiary(DATE);
    expect(diary.meals).toHaveLength(1);
    expect(diary.meals[0].entries).toHaveLength(2);
    expect(diary.totals.kcal).toBeCloseTo(358 * 1.5);
  });

  it("congela i macro al momento dell'inserimento", async () => {
    await addFoodEntry({
      date: DATE,
      mealTypeId: MEAL_TYPE_IDS.lunch,
      foodId: riceId,
      quantityG: 100,
    });

    // L'alimento viene corretto DOPO: lo storico non deve cambiare.
    await updateFood(riceId, {
      name: "Riso",
      nutrients: { ...EMPTY_NUTRIENTS, kcal: 1000, protein: 0, carbs: 0, fat: 0 },
    });

    expect((await getDayDiary(DATE)).totals.kcal).toBeCloseTo(358);
  });
});

describe("addRecipeEntry", () => {
  it("registra i valori a porzione moltiplicati per le porzioni", async () => {
    const recipeId = await createRecipe({
      name: "Riso semplice",
      servings: 2,
      items: [{ foodId: riceId, quantityG: 200 }],
    });

    await addRecipeEntry({
      date: DATE,
      mealTypeId: MEAL_TYPE_IDS.dinner,
      recipeId,
      servings: 1,
    });

    // 200 g di riso = 716 kcal totali, 358 a porzione.
    expect((await getDayDiary(DATE)).totals.kcal).toBeCloseTo(358);
  });
});

describe("addFreeEntry", () => {
  it("registra una voce libera con i valori indicati", async () => {
    await addFreeEntry({
      date: DATE,
      mealTypeId: MEAL_TYPE_IDS.dinner,
      label: "Margherita al ristorante",
      nutrients: { ...EMPTY_NUTRIENTS, kcal: 850, protein: 35, carbs: 90, fat: 30 },
      isEstimated: true,
    });

    const diary = await getDayDiary(DATE);
    const entry = diary.meals[0].entries[0];
    expect(entry.label).toBe("Margherita al ristorante");
    expect(entry.is_estimated).toBe(1);
    expect(diary.totals.kcal).toBeCloseTo(850);
  });
});

describe("updateEntryQuantity", () => {
  it("ricalcola lo snapshot dai valori attuali dell'alimento", async () => {
    const entryId = await addFoodEntry({
      date: DATE,
      mealTypeId: MEAL_TYPE_IDS.lunch,
      foodId: riceId,
      quantityG: 100,
    });

    await updateEntryQuantity(entryId, 250);
    expect((await getDayDiary(DATE)).totals.kcal).toBeCloseTo(358 * 2.5);
  });

  it("su una voce libera scala proporzionalmente lo snapshot", async () => {
    const entryId = await addFreeEntry({
      date: DATE,
      mealTypeId: MEAL_TYPE_IDS.dinner,
      label: "Piatto stimato",
      nutrients: { ...EMPTY_NUTRIENTS, kcal: 500 },
    });

    // Le voci libere non hanno una quantità di riferimento: la modifica moltiplica.
    await updateEntryQuantity(entryId, 2);
    expect((await getDayDiary(DATE)).totals.kcal).toBeCloseTo(1000);
  });
});

describe("deleteEntry", () => {
  it("toglie la riga dai totali", async () => {
    const entryId = await addFoodEntry({
      date: DATE,
      mealTypeId: MEAL_TYPE_IDS.lunch,
      foodId: riceId,
      quantityG: 100,
    });
    await deleteEntry(entryId);
    expect((await getDayDiary(DATE)).totals.kcal).toBe(0);
  });
});

describe("getDayDiary", () => {
  it("su un giorno vuoto ritorna zero pasti e totali a zero", async () => {
    const diary = await getDayDiary("2026-01-01");
    expect(diary.meals).toEqual([]);
    expect(diary.totals).toEqual(EMPTY_NUTRIENTS);
  });

  it("ordina i pasti secondo l'ordine dei tipi", async () => {
    await addFoodEntry({ date: DATE, mealTypeId: MEAL_TYPE_IDS.dinner, foodId: riceId, quantityG: 10 });
    await addFoodEntry({ date: DATE, mealTypeId: MEAL_TYPE_IDS.breakfast, foodId: riceId, quantityG: 10 });

    const diary = await getDayDiary(DATE);
    expect(diary.meals.map((m) => m.type.name)).toEqual(["colazione", "cena"]);
  });

  it("non mescola giorni diversi", async () => {
    await addFoodEntry({ date: DATE, mealTypeId: MEAL_TYPE_IDS.lunch, foodId: riceId, quantityG: 100 });
    expect((await getDayDiary("2026-08-29")).totals.kcal).toBe(0);
  });
});

describe("copyDay", () => {
  it("duplica tutte le righe sul giorno di destinazione", async () => {
    await addFoodEntry({ date: DATE, mealTypeId: MEAL_TYPE_IDS.lunch, foodId: riceId, quantityG: 100 });
    await copyDay(DATE, "2026-08-29");

    expect((await getDayDiary("2026-08-29")).totals.kcal).toBeCloseTo(358);
    // L'originale resta intatto.
    expect((await getDayDiary(DATE)).totals.kcal).toBeCloseTo(358);
  });
});
```

- [ ] **Step 2: Eseguire per vederlo fallire**

Run: `npx jest src/db/queries/diary.test.ts`
Atteso: FAIL.

- [ ] **Step 3: Scrivere `src/db/queries/diary.ts`**

Il punto centrale è `writeSnapshot`: ogni riga porta con sé i macro calcolati al momento dell'inserimento. È il motivo per cui correggere un alimento non riscrive lo storico.

Struttura da implementare:
- `ensureMeal(date, mealTypeId)` - `SELECT` del pasto esistente non cancellato, altrimenti `INSERT`. Ritorna l'id.
- `insertEntry(mealId, partial)` - una sola funzione di scrittura che riceve già lo snapshot calcolato, così le tre `add*` differiscono solo per come lo ottengono.
- `addFoodEntry` - legge l'alimento, `scaleNutrients(foodNutrients(food), quantityG)`, incrementa `usage_count`.
- `addRecipeEntry` - `buildRecipeTree`, `recipePerServing`, moltiplica per le porzioni, incrementa `usage_count`.
- `addFreeEntry` - usa i nutrienti passati così come sono.
- `updateEntryQuantity` - se la riga ha `food_id` ricalcola dai valori **attuali** dell'alimento (l'utente sta correggendo adesso, quindi il dato fresco è quello giusto); se ha `recipe_id` ricostruisce l'albero; se è libera scala lo snapshot esistente in proporzione al rapporto tra nuova e vecchia quantità, dove la quantità di una voce libera parte da 1.
- `getDayDiary` - una query sui pasti del giorno con join sul tipo, una sulle righe, aggregazione con `sumNutrients`. I pasti senza righe vive non compaiono.
- `copyDay` - copia le righe con nuovi id e nuovi timestamp, mantenendo gli snapshot.
- `listMealTypes`, `createMealType` (`is_custom = 1`, `sort` = max + 10), `renameMealType`, `deleteMealType` (logica; i tipi di default non sono cancellabili).

- [ ] **Step 4: Eseguire i test**

Run: `npx jest src/db/queries/diary.test.ts`
Atteso: PASS.

- [ ] **Step 5: Costruire la schermata Oggi**

`TodayScreen.tsx`:
- `DayHeader` in alto: freccia indietro, etichetta del giorno tradotta da `dayLabelKind` (Oggi / Ieri / Domani / data estesa), freccia avanti. Swipe orizzontale con `SwipeTabView` per cambiare giorno.
- Riepilogo: kcal consumate su obiettivo (l'anello arriva nel Task 8; qui basta un numero grande più le tre barre dei macro con i colori `theme.colors.macro`).
- Una `MealSection` per tipo di pasto presente, più una riga "aggiungi" per i tipi non ancora usati.
- `EntryRow`: nome, quantità, kcal a destra; tap apre `QuantitySheet` per modificare, swipe o long press per eliminare con conferma.
- FAB che apre `AddEntrySheet`.

`AddEntrySheet.tsx` - bottom sheet con la scelta del tipo di pasto e tre tab: Alimenti, Le mie ricette, Voce libera. Ricerca in cima, preferiti e più usati in testa alla lista.

`QuantitySheet.tsx` - tastierino numerico grande, unità (g/ml per gli alimenti, porzioni per le ricette), scorciatoie basate su `default_serving_g` ("1 vasetto = 150 g"), anteprima delle kcal risultanti che si aggiorna mentre si digita.

`MealTypesScreen.tsx` (raggiungibile da Profilo) - elenco dei tipi con riordino, rinomina e creazione di tipi custom.

- [ ] **Step 6: Gate + screenshot**

```bash
npm run typecheck && npm run lint && npm test && npm run android
adb exec-out screencap -p > /tmp/kaltrack-task7-day-empty.png
adb exec-out screencap -p > /tmp/kaltrack-task7-day-full.png
adb exec-out screencap -p > /tmp/kaltrack-task7-add.png
adb exec-out screencap -p > /tmp/kaltrack-task7-quantity.png
```

Verificare: giorno vuoto con stato vuoto sensato; giorno con tre pasti e totali corretti; il cambio giorno con swipe non perde lo scroll; il bottom sheet rispetta la safe area.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Add the meal diary, the core of the app

A day is a set of meals grouped by type, each holding entries that
reference a food, a recipe, or nothing at all for a free-text line like
'margherita at the restaurant'.

Every entry stores a snapshot of its macros at logging time. This is the
central decision of the diary: correcting a food's values tomorrow must
not silently rewrite what was eaten last month. A test pins this by
mutating a food after logging and asserting the day's total is
unchanged. Editing an entry's quantity does recompute from the food's
current values, since the user is deliberately correcting that line now.

Meals are created lazily: logging into a meal type that has no meal yet
for that day creates one, and logging again reuses it, so the user never
manages meal containers directly. Meal types are seeded but extensible,
and custom ones can be added, renamed and reordered.

copyDay duplicates a day's entries with fresh ids while preserving the
snapshots, which is what 'dinner like yesterday' needs."
```

---

## Task 8: Profilo, obiettivi e anello calorico

**Files:**
- Create: `src/db/queries/settings.ts`, `src/db/queries/settings.test.ts`, `src/containers/profile/ProfileForm.tsx`, `src/containers/profile/TargetsForm.tsx`, `src/containers/diary/CalorieRing.tsx`, `src/containers/diary/MacroBars.tsx`, `src/navigation/screens/TargetsScreen.tsx`
- Modify: `src/navigation/screens/ProfileScreen.tsx`, `src/navigation/screens/TodayScreen.tsx`, `src/navigation/index.tsx`, `src/hooks/useAppNav.ts`, i due file i18n

**Interfaces:**
- Consumes: `suggestTargets`, `ageAt`, `bmr`, `tdee`, `Sex`, `ActivityLevel`, `Goal`, `todayIso`
- Produces:
  - `ProfileRow`, `TargetRow`
  - `getProfile(): Promise<ProfileRow | null>`
  - `saveProfile(input: { sex: Sex; birthdate: string; heightCm: number; activityLevel: ActivityLevel; goal: Goal }): Promise<void>`
  - `getTargetsFor(date: string): Promise<TargetRow | null>` - l'obiettivo in vigore a quella data
  - `saveTargets(input: { validFrom: string; kcal: number; proteinG: number; carbsG: number; fatG: number; steps: number }): Promise<void>`
  - `getSetting(key: string): Promise<string | null>`, `setSetting(key: string, value: string): Promise<void>`

- [ ] **Step 1: Scrivere `src/db/queries/settings.test.ts` (fallisce)**

Il comportamento non ovvio è la storicizzazione: un obiettivo vale dalla sua `valid_from` in poi, e una data passata deve vedere l'obiettivo di allora.

```ts
import { createTestDb } from "@/src/db/__testing__/betterSqliteAdapter";
import { __setDbForTesting } from "@/src/db/index";
import { runMigrations } from "@/src/db/migrations";
import {
  getProfile,
  getSetting,
  getTargetsFor,
  saveProfile,
  saveTargets,
  setSetting,
} from "@/src/db/queries/settings";

beforeEach(async () => {
  const db = createTestDb();
  await runMigrations(db);
  __setDbForTesting(db);
});

afterEach(() => __setDbForTesting(null));

const targets = (validFrom: string, kcal: number) => ({
  validFrom,
  kcal,
  proteinG: 160,
  carbsG: 200,
  fatG: 70,
  steps: 10000,
});

describe("saveProfile", () => {
  it("salva e rilegge il profilo", async () => {
    await saveProfile({
      sex: "male",
      birthdate: "1995-06-15",
      heightCm: 180,
      activityLevel: "moderate",
      goal: "cut",
    });

    const profile = await getProfile();
    expect(profile?.height_cm).toBe(180);
    expect(profile?.goal).toBe("cut");
  });

  it("resta una riga sola: salvare di nuovo aggiorna", async () => {
    await saveProfile({ sex: "male", birthdate: "1995-06-15", heightCm: 180, activityLevel: "moderate", goal: "cut" });
    await saveProfile({ sex: "male", birthdate: "1995-06-15", heightCm: 182, activityLevel: "active", goal: "bulk" });

    expect((await getProfile())?.height_cm).toBe(182);
  });
});

describe("getTargetsFor", () => {
  it("senza obiettivi ritorna null", async () => {
    expect(await getTargetsFor("2026-08-28")).toBeNull();
  });

  it("ritorna l'obiettivo in vigore alla data", async () => {
    await saveTargets(targets("2026-01-01", 2000));
    await saveTargets(targets("2026-06-01", 2400));

    expect((await getTargetsFor("2026-03-15"))?.kcal).toBe(2000);
    expect((await getTargetsFor("2026-08-28"))?.kcal).toBe(2400);
  });

  it("una data precedente a ogni obiettivo ritorna null", async () => {
    await saveTargets(targets("2026-06-01", 2400));
    expect(await getTargetsFor("2026-01-01")).toBeNull();
  });

  it("salvare due volte la stessa valid_from sostituisce invece di duplicare", async () => {
    await saveTargets(targets("2026-06-01", 2400));
    await saveTargets(targets("2026-06-01", 2600));

    expect((await getTargetsFor("2026-06-01"))?.kcal).toBe(2600);
  });
});

describe("settings", () => {
  it("legge null per una chiave assente", async () => {
    expect(await getSetting("voice_reply_enabled")).toBeNull();
  });

  it("scrive e rilegge", async () => {
    await setSetting("voice_reply_enabled", "true");
    expect(await getSetting("voice_reply_enabled")).toBe("true");
  });

  it("sovrascrive una chiave esistente", async () => {
    await setSetting("lang", "it");
    await setSetting("lang", "en");
    expect(await getSetting("lang")).toBe("en");
  });
});
```

- [ ] **Step 2: Eseguire per vederlo fallire, poi implementare**

`getTargetsFor` è `SELECT * FROM targets WHERE deleted_at IS NULL AND valid_from <= ? ORDER BY valid_from DESC LIMIT 1`.
`saveTargets` cancella logicamente un eventuale obiettivo con la stessa `valid_from` prima di inserire, così la storia resta lineare.
`saveProfile` fa upsert su id fisso `"profile"`.
`setSetting` usa `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`.

Run: `npx jest src/db/queries/settings.test.ts`
Atteso: PASS.

- [ ] **Step 3: Costruire l'anello calorico**

`CalorieRing.tsx` (`containers/diary/`) - `react-native-svg`, due `Circle` concentrici: traccia grigia e arco di progresso. `strokeDasharray` sulla circonferenza, `strokeDashoffset` proporzionale al consumato. Animazione con `react-native-reanimated` (`useSharedValue` + `withSpring`), mai `Animated` di RN.

Regole di colore, che sono anche accessibilità (mai il colore da solo a portare l'informazione: sotto l'anello c'è sempre il numero):
- sotto obiettivo: `theme.colors.primary`
- entro il 5% dall'obiettivo: `theme.colors.success`
- oltre obiettivo: `theme.colors.warning`

Al centro le kcal rimanenti e, sotto, "di N". Senza obiettivo impostato mostra le kcal consumate e un invito a impostare l'obiettivo che porta a `TargetsScreen`.

`MacroBars.tsx` - tre barre orizzontali proteine/carboidrati/grassi con i colori `theme.colors.macro`, valore e obiettivo in etichetta.

- [ ] **Step 4: Costruire le schermate profilo e obiettivi**

`ProfileScreen.tsx` - `GradientHeader` con avatar e nome, poi voci di navigazione: Obiettivi, I miei alimenti, Le mie ricette, Tipi di pasto, Backup, Impostazioni. Sotto, un riquadro con peso attuale e passi di oggi.

`TargetsScreen.tsx` - due sezioni. In alto `ProfileForm` (sesso, data di nascita, altezza, livello di attività, obiettivo). Sotto `TargetsForm` con i quattro valori più i passi, e un bottone **Calcola** che riempie i campi con `suggestTargets` usando il peso più recente da `weight_logs`, lasciandoli modificabili. Sopra i campi, in piccolo, BMR e TDEE calcolati, così il numero suggerito è spiegato invece che magico.

Il salvataggio scrive un nuovo `targets` con `valid_from` = oggi: gli obiettivi passati restano.

- [ ] **Step 5: Gate + screenshot**

```bash
npm run typecheck && npm run lint && npm test && npm run android
adb exec-out screencap -p > /tmp/kaltrack-task8-ring-under.png
adb exec-out screencap -p > /tmp/kaltrack-task8-ring-over.png
adb exec-out screencap -p > /tmp/kaltrack-task8-targets.png
adb exec-out screencap -p > /tmp/kaltrack-task8-profile.png
```

Verificare: l'anello si anima all'apertura, il colore cambia superando l'obiettivo, il numero al centro resta leggibile con quattro cifre, il pulsante Calcola riempie i campi con valori sensati.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Add profile, historicised targets and the calorie ring

Targets carry a valid_from date and are never overwritten in place:
raising the daily calories today leaves March's days measured against
March's target, so the progress charts stay honest. Looking up a day's
target is the most recent row not in the future, and saving twice on the
same date replaces rather than duplicates.

The targets screen suggests values from the profile and the most recent
logged weight using Mifflin-St Jeor and an activity factor, and shows
the BMR and TDEE it derived them from, so the number is explained rather
than magic. Every field stays editable.

The calorie ring is drawn with react-native-svg and animated with
reanimated. Its colour distinguishes under target, on target and over,
but the remaining-calorie figure is always printed at the centre: the
colour never carries the information alone."
```

---

## Task 9: Peso e passi

**Files:**
- Create: `src/db/queries/tracking.ts`, `src/db/queries/tracking.test.ts`, `src/containers/tracking/StepsCard.tsx`, `src/containers/tracking/WeightCard.tsx`, `src/containers/tracking/QuickLogSheet.tsx`, `src/navigation/screens/StepsScreen.tsx`, `src/navigation/screens/WeightScreen.tsx`
- Modify: `src/navigation/screens/TodayScreen.tsx`, `src/navigation/screens/ProgressScreen.tsx`, `src/navigation/index.tsx`, `src/hooks/useAppNav.ts`, i due file i18n

**Interfaces:**
- Consumes: `todayIso`, `addDays`, `startOfWeek`
- Produces:
  - `StepLogRow`, `WeightLogRow`
  - `getSteps(date: string): Promise<StepLogRow | null>`
  - `setSteps(date: string, steps: number, source?: "manual" | "voice"): Promise<void>`
  - `listSteps(fromDate: string, toDate: string): Promise<StepLogRow[]>`
  - `getWeight(date: string): Promise<WeightLogRow | null>`
  - `setWeight(date: string, weightKg: number, bodyFatPct?: number | null, note?: string | null): Promise<void>`
  - `listWeights(fromDate: string, toDate: string): Promise<WeightLogRow[]>`
  - `latestWeight(): Promise<WeightLogRow | null>`
  - `deleteSteps(date: string): Promise<void>`, `deleteWeight(date: string): Promise<void>`

- [ ] **Step 1: Scrivere `src/db/queries/tracking.test.ts` (fallisce)**

Il comportamento da fissare è l'upsert per data: un giorno ha una sola misura, riscriverla la sostituisce.

```ts
import { createTestDb } from "@/src/db/__testing__/betterSqliteAdapter";
import { __setDbForTesting } from "@/src/db/index";
import { runMigrations } from "@/src/db/migrations";
import {
  deleteSteps,
  getSteps,
  getWeight,
  latestWeight,
  listSteps,
  listWeights,
  setSteps,
  setWeight,
} from "@/src/db/queries/tracking";

beforeEach(async () => {
  const db = createTestDb();
  await runMigrations(db);
  __setDbForTesting(db);
});

afterEach(() => __setDbForTesting(null));

describe("setSteps", () => {
  it("salva e rilegge", async () => {
    await setSteps("2026-08-28", 8432);
    expect((await getSteps("2026-08-28"))?.steps).toBe(8432);
  });

  it("riscrivere lo stesso giorno sostituisce invece di sommare", async () => {
    await setSteps("2026-08-28", 8000);
    await setSteps("2026-08-28", 12000);

    expect((await getSteps("2026-08-28"))?.steps).toBe(12000);
    expect(await listSteps("2026-08-01", "2026-08-31")).toHaveLength(1);
  });

  it("registra la sorgente", async () => {
    await setSteps("2026-08-28", 9000, "voice");
    expect((await getSteps("2026-08-28"))?.source).toBe("voice");
  });

  it("un giorno senza dati ritorna null, non zero", async () => {
    expect(await getSteps("2026-08-28")).toBeNull();
  });
});

describe("listSteps", () => {
  it("filtra per intervallo, estremi inclusi, in ordine di data", async () => {
    await setSteps("2026-08-23", 100);
    await setSteps("2026-08-24", 200);
    await setSteps("2026-08-30", 300);

    const rows = await listSteps("2026-08-24", "2026-08-30");
    expect(rows.map((r) => r.steps)).toEqual([200, 300]);
  });
});

describe("deleteSteps", () => {
  it("rimuove la misura del giorno", async () => {
    await setSteps("2026-08-28", 8000);
    await deleteSteps("2026-08-28");
    expect(await getSteps("2026-08-28")).toBeNull();
  });
});

describe("setWeight", () => {
  it("salva peso e percentuale di grasso", async () => {
    await setWeight("2026-08-28", 78.5, 14.2);
    const row = await getWeight("2026-08-28");
    expect(row?.weight_kg).toBe(78.5);
    expect(row?.body_fat_pct).toBe(14.2);
  });

  it("riscrivere lo stesso giorno sostituisce", async () => {
    await setWeight("2026-08-28", 78.5);
    await setWeight("2026-08-28", 78.1);
    expect((await getWeight("2026-08-28"))?.weight_kg).toBe(78.1);
    expect(await listWeights("2026-08-01", "2026-08-31")).toHaveLength(1);
  });
});

describe("latestWeight", () => {
  it("ritorna la misura più recente", async () => {
    await setWeight("2026-08-20", 79);
    await setWeight("2026-08-28", 78.2);
    expect((await latestWeight())?.weight_kg).toBe(78.2);
  });

  it("senza misure ritorna null", async () => {
    expect(await latestWeight()).toBeNull();
  });
});
```

- [ ] **Step 2: Implementare `src/db/queries/tracking.ts`**

Entrambe le tabelle hanno un indice unico su `date`: l'upsert usa `ON CONFLICT(date) DO UPDATE SET`. La cancellazione qui è fisica, non logica: un giorno ha una sola misura, non c'è storico da preservare.

Run: `npx jest src/db/queries/tracking.test.ts`
Atteso: PASS.

- [ ] **Step 3: Costruire la UI**

`StepsCard.tsx` e `WeightCard.tsx` in `TodayScreen`: valore del giorno, obiettivo passi con barra, tap per inserire.

`QuickLogSheet.tsx` - bottom sheet con tastierino numerico, riusato da entrambe: prende titolo, unità, valore corrente e callback.

`StepsScreen.tsx` - lista per giorno con inserimento rapido, barre della settimana, media settimanale, e la possibilità di scorrere indietro nel tempo per riempire i giorni mancanti. È la schermata che la modalità vocale multi-giorno andrà a popolare in Fase 2.

`WeightScreen.tsx` - grafico a linea del peso (react-native-svg), lista delle misure, inserimento e modifica.

`ProgressScreen.tsx` - passa da segnaposto a schermata reale con tre riquadri: andamento peso, media passi settimanale, media calorie settimanale.

- [ ] **Step 4: Gate + screenshot**

```bash
npm run typecheck && npm run lint && npm test && npm run android
adb exec-out screencap -p > /tmp/kaltrack-task9-today.png
adb exec-out screencap -p > /tmp/kaltrack-task9-steps.png
adb exec-out screencap -p > /tmp/kaltrack-task9-weight.png
adb exec-out screencap -p > /tmp/kaltrack-task9-progress.png
```

Verificare: il grafico del peso regge sia due punti sia trenta, la barra dei passi non esce dal riquadro superando l'obiettivo, i giorni senza dati appaiono vuoti e non a zero.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Add manual step and weight tracking

Both are one measurement per day, enforced by a unique index on date and
written through an upsert: re-entering a day replaces its value instead
of accumulating a second row. Deletion here is physical rather than
logical, since there is no history to preserve behind a single daily
figure.

A day with no data reads back as null, not zero, so charts and averages
can distinguish 'did not walk' from 'did not record', which matters as
soon as weekly averages appear.

Steps carry a source field, already distinguishing manual from voice
entry so the Phase 2 multi-day voice logging has somewhere to land.

The Progress tab moves from placeholder to a real screen with weight
trend, weekly step average and weekly calorie average."
```

---

## Task 10: Backup ed export

Chiude la Fase 1: senza questo, perdere il telefono significa perdere tutto.

**Files:**
- Create: `src/services/backup.ts`, `src/services/backup.test.ts`, `src/navigation/screens/BackupScreen.tsx`
- Modify: `src/navigation/screens/ProfileScreen.tsx`, `src/navigation/index.tsx`, `src/hooks/useAppNav.ts`, i due file i18n

**Interfaces:**
- Consumes: `getDb`, `nowIso`
- Produces:
  - `BACKUP_FORMAT_VERSION = 1`
  - `BackupPayload` = `{ formatVersion: number; exportedAt: string; schemaVersion: number; tables: Record<string, unknown[]> }`
  - `buildBackup(): Promise<BackupPayload>`
  - `exportBackupToFile(): Promise<string>` - ritorna il path del file scritto
  - `shareBackup(): Promise<void>`
  - `restoreBackup(payload: BackupPayload): Promise<void>`
  - `parseBackup(json: string): BackupPayload` - lancia `BackupFormatError` se non valido

- [ ] **Step 1: Scrivere `src/services/backup.test.ts` (fallisce)**

```ts
import { createTestDb } from "@/src/db/__testing__/betterSqliteAdapter";
import { __setDbForTesting } from "@/src/db/index";
import { MEAL_TYPE_IDS, runMigrations } from "@/src/db/migrations";
import { addFoodEntry, getDayDiary } from "@/src/db/queries/diary";
import { createFood, searchFoods } from "@/src/db/queries/foods";
import { setSteps } from "@/src/db/queries/tracking";
import {
  BACKUP_FORMAT_VERSION,
  BackupFormatError,
  buildBackup,
  parseBackup,
  restoreBackup,
} from "@/src/services/backup";
import { EMPTY_NUTRIENTS } from "@/src/domain/nutrition";

const seedData = async () => {
  const foodId = await createFood({
    name: "Riso",
    nutrients: { ...EMPTY_NUTRIENTS, kcal: 358, carbs: 79 },
  });
  await addFoodEntry({
    date: "2026-08-28",
    mealTypeId: MEAL_TYPE_IDS.lunch,
    foodId,
    quantityG: 100,
  });
  await setSteps("2026-08-28", 9000);
};

const freshDb = async () => {
  const db = createTestDb();
  await runMigrations(db);
  __setDbForTesting(db);
};

beforeEach(freshDb);
afterEach(() => __setDbForTesting(null));

describe("buildBackup", () => {
  it("include la versione di formato e quella di schema", async () => {
    const backup = await buildBackup();
    expect(backup.formatVersion).toBe(BACKUP_FORMAT_VERSION);
    expect(backup.schemaVersion).toBeGreaterThan(0);
  });

  it("include tutte le tabelle dati", async () => {
    await seedData();
    const backup = await buildBackup();

    expect(Object.keys(backup.tables)).toEqual(
      expect.arrayContaining([
        "foods",
        "recipes",
        "recipe_items",
        "meal_types",
        "meals",
        "meal_entries",
        "profile",
        "targets",
        "weight_logs",
        "step_logs",
        "settings",
      ]),
    );
    expect(backup.tables.meal_entries).toHaveLength(1);
  });
});

describe("restoreBackup", () => {
  it("ripristina i dati su un database vuoto", async () => {
    await seedData();
    const backup = await buildBackup();

    await freshDb();
    expect((await getDayDiary("2026-08-28")).totals.kcal).toBe(0);

    await restoreBackup(backup);
    expect((await getDayDiary("2026-08-28")).totals.kcal).toBeCloseTo(358);
  });

  it("sostituisce i dati esistenti invece di fonderli", async () => {
    await seedData();
    const backup = await buildBackup();

    await freshDb();
    await createFood({ name: "Da sovrascrivere", nutrients: EMPTY_NUTRIENTS });
    await restoreBackup(backup);

    const names = (await searchFoods("")).map((f) => f.name);
    expect(names).not.toContain("Da sovrascrivere");
    expect(names).toContain("Riso");
  });

  it("è reversibile: esporta, ripristina, riesporta dà lo stesso contenuto", async () => {
    await seedData();
    const first = await buildBackup();

    await freshDb();
    await restoreBackup(first);
    const second = await buildBackup();

    expect(second.tables).toEqual(first.tables);
  });
});

describe("parseBackup", () => {
  it("accetta un backup valido", async () => {
    await seedData();
    const json = JSON.stringify(await buildBackup());
    expect(parseBackup(json).formatVersion).toBe(BACKUP_FORMAT_VERSION);
  });

  it("rifiuta JSON non valido", () => {
    expect(() => parseBackup("non json")).toThrow(BackupFormatError);
  });

  it("rifiuta un formato più recente di quello supportato", () => {
    const json = JSON.stringify({
      formatVersion: BACKUP_FORMAT_VERSION + 1,
      exportedAt: "2026-08-28T00:00:00.000Z",
      schemaVersion: 3,
      tables: {},
    });
    expect(() => parseBackup(json)).toThrow(BackupFormatError);
  });

  it("rifiuta un oggetto senza tables", () => {
    const json = JSON.stringify({ formatVersion: 1, exportedAt: "x", schemaVersion: 3 });
    expect(() => parseBackup(json)).toThrow(BackupFormatError);
  });
});
```

- [ ] **Step 2: Implementare `src/services/backup.ts`**

`buildBackup` fa `SELECT *` su ogni tabella dell'elenco (comprese le righe con `deleted_at`: un backup deve essere fedele, non ripulito) e legge `PRAGMA user_version`.

`restoreBackup` gira in una transazione: svuota le tabelle nell'ordine inverso alle dipendenze, poi reinserisce nell'ordine diretto. Se lo `schemaVersion` del backup è inferiore a quello corrente, prima si applicano le migrazioni mancanti; se è superiore, si rifiuta con un messaggio chiaro invece di corrompere il DB.

`exportBackupToFile` scrive in `FileSystem.documentDirectory` con nome `kaltrack-backup-YYYY-MM-DD.json`; `shareBackup` lo passa a `expo-sharing`.

- [ ] **Step 3: Costruire `BackupScreen.tsx`**

Due azioni: **Esporta** (scrive e apre il foglio di condivisione) e **Importa** (selezione file, anteprima con data del backup e conteggio righe per tabella, poi conferma con `DfAlert` che avverte esplicitamente che i dati attuali verranno sostituiti). Sotto, la data dell'ultimo export salvata in `settings`.

- [ ] **Step 4: Gate + screenshot + prova reale**

```bash
npm run typecheck && npm run lint && npm test && npm run android
```

Prova end-to-end sull'emulatore, che è l'unica che conta davvero qui: esportare, disinstallare l'app (`adb uninstall com.koski.kaltrack`), reinstallarla, importare il file, verificare che diario, alimenti, ricette, peso e passi siano tornati.

```bash
adb exec-out screencap -p > /tmp/kaltrack-task10-backup.png
adb exec-out screencap -p > /tmp/kaltrack-task10-restored.png
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Add JSON backup, export and restore

Closes Phase 1. With no backend, losing the phone means losing
everything, so export is a feature rather than a nicety.

The backup is a single JSON file carrying a format version, the schema
version it was taken at, and a full dump of every table including
soft-deleted rows: a backup should be faithful, not tidied. Restore runs
in one transaction, clearing tables in reverse dependency order before
reinserting, and replaces the current data rather than merging, which is
the only semantics that round-trips predictably. A test asserts
export -> restore -> export produces identical content.

A backup from an older schema is migrated forward before restoring; one
from a newer format is refused with a clear message instead of
corrupting the database. The import screen states plainly that current
data will be replaced before it proceeds.

Verified end to end on the emulator: export, uninstall, reinstall,
import, all data back."
```

---

## Definizione di completo per la Fase 1

La fase è chiusa quando, su un telefono reale:

1. Si registra un pasto completo in meno di 30 secondi partendo dalla schermata Oggi
2. Il seed alimenti copre gli ingredienti di uso quotidiano senza doverli creare a mano
3. Una ricetta salvata si inserisce nel diario in due tap
4. L'anello mostra il residuo calorico corretto rispetto all'obiettivo del giorno
5. Peso e passi si inseriscono e compaiono in Progressi
6. Un backup esportato e reimportato restituisce esattamente gli stessi dati
7. `npm run typecheck`, `npm run lint` e `npm test` sono verdi
8. L'app si avvia da fredda in meno di 3 secondi senza rete

---

## Self-review

**Copertura della spec.** Le sezioni 3.2, 3.3, 3.4, 3.5 e 3.6 sono coperte dai Task 1 e 4. Il modello dati della sezione 4 è coperto dal Task 2 (tabelle) più il Task 5 (migrazione 003). Le fasi 1-9 elencate nella sezione 8 della spec mappano sui Task 1-10 di questo piano. Le sezioni 5 (assistente), 7 (palestra) e 6 limitatamente ai tab Palestra e alle parti AI di Progressi restano fuori: sono Fase 2 e Fase 3 e avranno il proprio piano. La sezione 4.3 (tabelle palestra) e 4.4 (`ai_calls`) non sono nella migrazione 001 di proposito: si aggiungono con le migrazioni della fase che le usa, così lo schema non porta tabelle vuote per mesi.

**Divergenze dalla spec introdotte qui, da riportare nella spec.**
- Il seed alimenti passa da "~400" a "almeno 150": 150 voci curate a mano coprono l'uso quotidiano, e il resto arriva da OpenFoodFacts in Fase 2 senza doverlo scrivere a mano.
- Aggiunta la colonna `name_norm` su `foods` e `recipes` (migrazione 003), non prevista nella sezione 4.1: serve alla ricerca accent-insensitive e servirà al matching vocale.
- Gli ingredienti annidati contano a **porzioni**, non a grammi. La spec diceva solo "può contenere un'altra ricetta"; questo piano fissa l'unità.
- `expo-image-picker` si installa nel Task 6 e non nel Task 1, perché la foto della ricetta è la sua prima consumatrice.

**Consistenza dei tipi.** `Nutrients` usa camelCase (`saturatedFat`) mentre le righe DB usano snake_case (`saturated_fat`): la conversione avviene solo in `foodNutrients` e nelle `add*Entry`, mai altrove. `FoodRow`, `RecipeRow`, `RecipeItemRow`, `MealRow`, `MealEntryRow`, `MealTypeRow`, `ProfileRow`, `TargetRow`, `StepLogRow`, `WeightLogRow` vivono tutti in `src/types/nutrition.ts` e rispecchiano esattamente le colonne. `searchFoods` e `searchRecipes` hanno la stessa firma `(term, limit?)`. `getDayDiary` è l'unico punto che aggrega un giorno: nessuna schermata somma per conto proprio.

**Rischi di esecuzione** (i primi due verificati durante il Task 1).
- `better-sqlite3` sotto il preset jest-expo: **funziona**, nessun fallback necessario.
- `expo-crypto.randomUUID()` nei test: **non disponibile**, risolto con
  `moduleNameMapper` verso `jest/mocks/expo-crypto.js` (Task 1).
- `react-dom` sembra una dipendenza web ma serve a gluestack anche su native: non
  rimuoverlo (Task 1 Step 7).
- I `CHECK` nella migrazione 001 non sono verificati da un test dedicato: se un `INSERT` viene rifiutato in modo inatteso durante il Task 6 o 7, la causa è quasi certamente lì.
