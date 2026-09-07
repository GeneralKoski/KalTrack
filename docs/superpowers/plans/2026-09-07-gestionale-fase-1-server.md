# Gestionale del catalogo, Fase 1: il server

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Portare sul server tutto cio' che il gestionale dovra' amministrare - descrizioni e foto degli esercizi, identita' stabile delle voci, moderazione delle proposte, tassonomie, interruttore AI - e le API che lo espongono, senza rompere i telefoni gia' installati.

**Architecture:** Le due tabelle di catalogo (`exercises`, `foods`) acquisiscono un `uid` stabile e uno stato di moderazione; nascono due tabelle di tassonomia; le letture pubbliche filtrano `published` e le scritture dall'app creano `pending`. Le rotte nuove stanno sotto `/api/catalog/*` (per l'app, con pull incrementale) e `/api/admin/*` (per il gestionale, dietro un middleware `EnsureAdmin`). Le rotte vecchie `/api/exercises` e `/api/foods` restano vive perche' un telefono con la build di ieri non deve smettere di funzionare il giorno del deploy.

**Tech Stack:** Laravel 13, PHP 8.3+, Sanctum 4, SQLite, PHPUnit 12. Lo script di export del seed gira in Node dentro il repo dell'app.

**Spec:** `docs/superpowers/specs/2026-09-07-gestionale-catalogo-design.md`

## Global Constraints

- **`env()` vietato fuori da `config/`.** Nel codice applicativo `config('foo.bar')`.
- **Mai `enum(...)` in migrazione, mai classi Enum dentro una migrazione.** Lo stato e' `string` con default `'published'` o `'pending'` scritto a mano.
- **Ogni migrazione ha un `down()` che e' l'inverso esatto dell'`up()`.**
- **Foreign key sempre con `constrained()` e policy `ON DELETE` esplicita.**
- **`store`/`update` usano un FormRequest dedicato**, mai `$request->all()`. Le rule sono array di stringhe, non pipe.
- **Mai `catch` silenzioso.** Log sempre con context array.
- **Il database e' SQLite** in test e in produzione: niente sintassi MySQL-only.
- **I commenti si scrivono in italiano e spiegano il perche', non il cosa.** E' la voce di questo repository: guarda `create_exercises_table` o `SyncController` prima di scrivere.
- **`created_by` non esce mai verso un utente normale.** Esce solo dalle rotte `/api/admin/*`.
- **I test hanno nomi italiani** (`test_una_proposta_non_esce_dal_catalogo`), usano `RefreshDatabase`, e stanno in `tests/Feature/`.
- **Tutti i comandi si lanciano da `backend/`** salvo dove scritto diversamente.

---

### Task 1: Moderazione e identita' su `exercises`

**Files:**
- Create: `backend/database/migrations/2026_09_07_100000_add_catalog_moderation_to_exercises.php`
- Modify: `backend/app/Models/Exercise.php`
- Test: `backend/tests/Feature/CatalogSchemaTest.php`

**Interfaces:**
- Produces: colonne `exercises.uid` (string 64, unique), `exercises.status` (string 12, default `'pending'`), `exercises.instructions` (text nullable), `exercises.photo` (string 120 nullable), `exercises.reviewed_at`, `exercises.reviewed_by`, `exercises.review_note`, `exercises.deleted_at`. Il model `Exercise` diventa `SoftDeletes` e i campi nuovi entrano in `#[Fillable]`.

- [ ] **Step 1: Scrivi il test che fallisce**

Crea `backend/tests/Feature/CatalogSchemaTest.php`:

```php
<?php

namespace Tests\Feature;

use App\Models\Exercise;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CatalogSchemaTest extends TestCase
{
    use RefreshDatabase;

    public function test_un_esercizio_esistente_nasce_pubblicato_e_con_un_uid(): void
    {
        $e = Exercise::create([
            'name' => 'Panca piana',
            'name_norm' => 'panca piana',
            'muscle_group' => 'petto',
            'uid' => 'ex-panca-piana',
        ]);

        $this->assertSame('published', $e->fresh()->status);
        $this->assertSame('ex-panca-piana', $e->fresh()->uid);
    }

    public function test_le_righe_di_prima_della_migrazione_sono_pubblicate(): void
    {
        /*
         * Le voci che c'erano prima erano gia' catalogo vivo: nascere
         * `pending` le nasconderebbe a tutti quelli che le usano.
         *
         * Si scrivono con il query builder per aggirare i default del model,
         * cioe' per somigliare a una riga scritta dal codice di ieri.
         */
        $id = \Illuminate\Support\Facades\DB::table('exercises')->insertGetId([
            'name' => 'Vecchio', 'name_norm' => 'vecchio', 'muscle_group' => 'petto',
            'uid' => 'vecchio', 'created_at' => now(), 'updated_at' => now(),
        ]);

        $this->assertSame('published', Exercise::find($id)->status);
    }

    public function test_un_esercizio_si_cancella_in_modo_morbido(): void
    {
        $e = Exercise::create([
            'name' => 'Rematore',
            'name_norm' => 'rematore',
            'muscle_group' => 'schiena',
            'uid' => 'ex-rematore',
        ]);

        $e->delete();

        $this->assertNull(Exercise::find($e->id));
        $this->assertNotNull(Exercise::withTrashed()->find($e->id)->deleted_at);
    }
}
```

Nota: `status` di default e' `'pending'` in colonna, ma il model lo imposta a `'published'` quando non e' dichiarato? **No.** Il default della colonna e' `'published'`, perche' cio' che entra da `Exercise::create()` senza passare dal controller e' il seed e le migrazioni. Il controller che riceve una proposta scrive `'pending'` esplicitamente. E' meno sorprendente di un default che dipende da chi chiama.

- [ ] **Step 2: Lancia il test e verifica che fallisca**

```bash
cd backend && php artisan test --filter=CatalogSchemaTest
```

Atteso: FAIL, "table exercises has no column named uid".

- [ ] **Step 3: Scrivi la migrazione**

Crea `backend/database/migrations/2026_09_07_100000_add_catalog_moderation_to_exercises.php`:

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

/**
 * Il catalogo smette di essere "tutto cio' che c'e' e' pubblico".
 *
 * Due cose insieme, perche' l'una senza l'altra non serve a niente.
 *
 * `uid` e' l'identita' stabile di una voce. Fin qui il telefono ritrovava una
 * voce dal NOME normalizzato, e reggeva perche' il nome non lo cambiava
 * nessuno: le uniche scritture venivano dall'app, e chi rinominava un
 * esercizio proprio lo ripubblicava. Da quando esiste un pannello che
 * rinomina, quel confronto si rompe in silenzio - la voce rinominata non si
 * riconosce piu' e al pull successivo diventa un doppione su ogni telefono.
 *
 * `status` e' la moderazione. La migrazione originale di questa tabella
 * dichiarava che "un esercizio che qualcuno si e' creato entra nell'elenco di
 * chiunque": da qui in poi non e' piu' vero, entra quando l'amministratore lo
 * decide. Il default della colonna resta `published` perche' cio' che nasce
 * senza passare da un controller e' il seed, e il seed e' catalogo per
 * definizione: e' il controller delle proposte a scrivere `pending`
 * esplicitamente.
 *
 * `deleted_at` c'e' perche' una voce tolta deve poter dire ai telefoni che e'
 * stata tolta. Una cancellazione vera non ha modo di raccontarsi, ed e' la
 * regola 1 della sincronizzazione applicata a una tabella che fin qui non ne
 * aveva bisogno.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('exercises', function (Blueprint $table) {
            // Nullable in questa prima passata: le righe che ci sono gia' non
            // hanno un uid, e un unique su una colonna piena di NULL non si
            // puo' creare finche' non sono state riempite.
            $table->string('uid', 64)->nullable()->after('id');
            $table->string('status', 12)->default('published')->after('equipment');
            $table->text('instructions')->nullable()->after('status');
            $table->string('photo', 120)->nullable()->after('instructions');
            $table->timestamp('reviewed_at')->nullable();
            $table->foreignId('reviewed_by')
                ->nullable()
                ->constrained('users')
                ->nullOnDelete();
            $table->string('review_note', 500)->nullable();
            $table->softDeletes();
        });

        // Le righe che esistono oggi erano gia' catalogo vivo: nascere
        // `pending` le nasconderebbe a tutti quelli che le usano.
        DB::table('exercises')->update(['status' => 'published']);

        foreach (DB::table('exercises')->whereNull('uid')->pluck('id') as $id) {
            DB::table('exercises')->where('id', $id)->update(['uid' => (string) Str::uuid()]);
        }

        Schema::table('exercises', function (Blueprint $table) {
            $table->unique('uid');
            $table->index('status');
        });
    }

    public function down(): void
    {
        Schema::table('exercises', function (Blueprint $table) {
            $table->dropUnique(['uid']);
            $table->dropIndex(['status']);
            $table->dropConstrainedForeignId('reviewed_by');
            $table->dropColumn([
                'uid',
                'status',
                'instructions',
                'photo',
                'reviewed_at',
                'review_note',
                'deleted_at',
            ]);
        });
    }
};
```

- [ ] **Step 4: Aggiorna il model**

In `backend/app/Models/Exercise.php`, sostituisci l'intero file:

```php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * Una voce del catalogo comune.
 *
 * `created_by` c'e' ma non esce mai verso un utente normale: serve a decidere
 * chi puo' correggere una voce, e all'amministratore per sapere chi ha
 * proposto cosa in revisione. Le rotte `/api/catalog/*` non lo espongono, le
 * rotte `/api/admin/*` si'.
 */
#[Fillable([
    'uid',
    'name',
    'name_norm',
    'muscle_group',
    'secondary_muscles',
    'equipment',
    'status',
    'instructions',
    'photo',
    'reviewed_at',
    'reviewed_by',
    'review_note',
    'created_by',
])]
class Exercise extends Model
{
    use SoftDeletes;

    /** Gli stati della moderazione. Sta qui perche' li leggono in tre. */
    public const STATUSES = ['pending', 'published', 'rejected'];

    protected function casts(): array
    {
        return ['reviewed_at' => 'datetime'];
    }
}
```

- [ ] **Step 5: Lancia i test e verifica che passino**

```bash
cd backend && php artisan test --filter=CatalogSchemaTest
```

Atteso: PASS, 2 test.

- [ ] **Step 6: Lancia l'intera suite, perche' questa tabella la usano gia' in due**

```bash
cd backend && php artisan test
```

Atteso: PASS. `ExerciseCatalogTest` e `PrivacyTest` toccano `exercises` e devono continuare a passare senza modifiche: se falliscono, la ragione e' nel codice nuovo, non nel test.

- [ ] **Step 7: Commit**

```bash
cd backend && git add database/migrations/2026_09_07_100000_add_catalog_moderation_to_exercises.php app/Models/Exercise.php tests/Feature/CatalogSchemaTest.php
git commit -m "feat(catalogo): identita' stabile e moderazione sugli esercizi"
```

---

### Task 2: Moderazione e identita' su `foods`

**Files:**
- Create: `backend/database/migrations/2026_09_07_100100_add_catalog_moderation_to_foods.php`
- Modify: `backend/app/Models/Food.php`
- Test: `backend/tests/Feature/CatalogSchemaTest.php` (si aggiunge ai due che ci sono)

**Interfaces:**
- Consumes: niente dal Task 1, ma ne ripete la forma di proposito.
- Produces: colonne `foods.uid`, `foods.status`, `foods.barcode` (string 32, index), `foods.off_id` (string 64), `foods.image` (string 120), `foods.reviewed_at`, `foods.reviewed_by`, `foods.review_note`, `foods.deleted_at`. `Food` diventa `SoftDeletes`.

- [ ] **Step 1: Scrivi il test che fallisce**

Aggiungi in `backend/tests/Feature/CatalogSchemaTest.php`, dentro la classe:

```php
    public function test_un_alimento_esistente_nasce_pubblicato_e_con_un_uid(): void
    {
        $f = \App\Models\Food::create([
            'name' => 'Pasta di semola cruda',
            'name_norm' => 'pasta di semola cruda',
            'uid' => 'seed-pasta-semola-cruda',
            'kcal' => 353,
        ]);

        $this->assertSame('published', $f->fresh()->status);
        $this->assertSame('seed-pasta-semola-cruda', $f->fresh()->uid);
    }

    public function test_un_alimento_porta_codice_a_barre_e_provenienza(): void
    {
        $f = \App\Models\Food::create([
            'name' => 'Pasta Lidl',
            'name_norm' => 'pasta lidl',
            'uid' => 'x-1',
            'barcode' => '4056489012345',
            'off_id' => '4056489012345',
        ]);

        $this->assertSame('4056489012345', $f->fresh()->barcode);
        $this->assertSame('4056489012345', $f->fresh()->off_id);
    }
```

- [ ] **Step 2: Lancia il test e verifica che fallisca**

```bash
cd backend && php artisan test --filter=CatalogSchemaTest
```

Atteso: FAIL, "table foods has no column named uid".

- [ ] **Step 3: Scrivi la migrazione**

Crea `backend/database/migrations/2026_09_07_100100_add_catalog_moderation_to_foods.php`:

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

/**
 * Le stesse sei colonne di moderazione degli esercizi, per lo stesso motivo,
 * piu' tre che riguardano solo gli alimenti.
 *
 * `barcode` e' identita' esatta: due prodotti con lo stesso codice sono lo
 * stesso prodotto, e il telefono ce l'ha dalla scansione da quando esiste
 * `FoodScanScreen`. Il server non lo aveva, quindi due telefoni che scansivano
 * lo stesso prodotto proponevano due voci che solo il nome poteva unire - e i
 * nomi di OpenFoodFacts non combaciano mai del tutto.
 *
 * `off_id` dice che i valori vengono da un archivio compilato da chiunque. In
 * revisione e' l'informazione che serve per decidere se fidarsi.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('foods', function (Blueprint $table) {
            $table->string('uid', 64)->nullable()->after('id');
            $table->string('status', 12)->default('published')->after('serving_label');
            $table->string('barcode', 32)->nullable()->after('brand');
            $table->string('off_id', 64)->nullable()->after('barcode');
            $table->string('image', 120)->nullable()->after('off_id');
            $table->timestamp('reviewed_at')->nullable();
            $table->foreignId('reviewed_by')
                ->nullable()
                ->constrained('users')
                ->nullOnDelete();
            $table->string('review_note', 500)->nullable();
            $table->softDeletes();
        });

        DB::table('foods')->update(['status' => 'published']);

        foreach (DB::table('foods')->whereNull('uid')->pluck('id') as $id) {
            DB::table('foods')->where('id', $id)->update(['uid' => (string) Str::uuid()]);
        }

        Schema::table('foods', function (Blueprint $table) {
            $table->unique('uid');
            $table->index('status');
            // Non unique: lo stesso codice puo' arrivare due volte prima che
            // qualcuno decida quale delle due voci tenere, e un vincolo del
            // database farebbe fallire una proposta invece di metterla in coda.
            $table->index('barcode');
        });
    }

    public function down(): void
    {
        Schema::table('foods', function (Blueprint $table) {
            $table->dropUnique(['uid']);
            $table->dropIndex(['status']);
            $table->dropIndex(['barcode']);
            $table->dropConstrainedForeignId('reviewed_by');
            $table->dropColumn([
                'uid',
                'status',
                'barcode',
                'off_id',
                'image',
                'reviewed_at',
                'review_note',
                'deleted_at',
            ]);
        });
    }
};
```

- [ ] **Step 4: Aggiorna il model**

In `backend/app/Models/Food.php`: aggiungi `use Illuminate\Database\Eloquent\SoftDeletes;` agli import, `use SoftDeletes;` come prima riga del corpo della classe, e nell'attributo `#[Fillable([...])]` aggiungi in testa `'uid',` e dopo `'serving_label',` aggiungi:

```php
    'status',
    'barcode',
    'off_id',
    'image',
    'reviewed_at',
    'reviewed_by',
    'review_note',
```

Nel metodo `casts()`, aggiungi `'reviewed_at' => 'datetime',`.

Sotto la costante `NUTRIENTS`, aggiungi:

```php
    /** Gli stessi tre stati degli esercizi: la moderazione e' una sola. */
    public const STATUSES = ['pending', 'published', 'rejected'];
```

- [ ] **Step 5: Lancia i test e verifica che passino**

```bash
cd backend && php artisan test --filter=CatalogSchemaTest
```

Atteso: PASS, 4 test.

- [ ] **Step 6: Lancia l'intera suite**

```bash
cd backend && php artisan test
```

Atteso: PASS.

- [ ] **Step 7: Commit**

```bash
cd backend && git add database/migrations/2026_09_07_100100_add_catalog_moderation_to_foods.php app/Models/Food.php tests/Feature/CatalogSchemaTest.php
git commit -m "feat(catalogo): identita' stabile, moderazione e codice a barre sugli alimenti"
```

---

### Task 3: Le tassonomie

**Files:**
- Create: `backend/database/migrations/2026_09_07_100200_create_taxonomy_tables.php`
- Create: `backend/app/Models/MuscleGroup.php`
- Create: `backend/app/Models/EquipmentType.php`
- Create: `backend/database/seeders/TaxonomySeeder.php`
- Modify: `backend/database/seeders/DatabaseSeeder.php`
- Test: `backend/tests/Feature/TaxonomyTest.php`

**Interfaces:**
- Produces: tabelle `muscle_groups` e `equipment_types`, entrambe `id`, `slug` (string 40, unique), `label_it` (string 60), `label_en` (string 60), `sort` (integer, default 0), `deleted_at`, timestamps. Model `App\Models\MuscleGroup` e `App\Models\EquipmentType`, entrambi `SoftDeletes`, fillable `['slug','label_it','label_en','sort']`. `TaxonomySeeder` popola i dodici gruppi e gli undici attrezzi che oggi stanno in `src/types/gym.ts`.

- [ ] **Step 1: Scrivi il test che fallisce**

Crea `backend/tests/Feature/TaxonomyTest.php`:

```php
<?php

namespace Tests\Feature;

use App\Models\EquipmentType;
use App\Models\MuscleGroup;
use Database\Seeders\TaxonomySeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TaxonomyTest extends TestCase
{
    use RefreshDatabase;

    public function test_il_seeder_popola_gruppi_e_attrezzi(): void
    {
        $this->seed(TaxonomySeeder::class);

        $this->assertSame(12, MuscleGroup::count());
        $this->assertSame(11, EquipmentType::count());

        $petto = MuscleGroup::where('slug', 'petto')->first();
        $this->assertSame('Petto', $petto->label_it);
        $this->assertSame('Chest', $petto->label_en);
    }

    public function test_il_seeder_e_idempotente(): void
    {
        $this->seed(TaxonomySeeder::class);
        $this->seed(TaxonomySeeder::class);

        $this->assertSame(12, MuscleGroup::count());
        $this->assertSame(11, EquipmentType::count());
    }

    public function test_uno_slug_non_si_ripete(): void
    {
        MuscleGroup::create(['slug' => 'petto', 'label_it' => 'Petto', 'label_en' => 'Chest']);

        $this->expectException(\Illuminate\Database\QueryException::class);
        MuscleGroup::create(['slug' => 'petto', 'label_it' => 'Altro', 'label_en' => 'Other']);
    }
}
```

- [ ] **Step 2: Lancia il test e verifica che fallisca**

```bash
cd backend && php artisan test --filter=TaxonomyTest
```

Atteso: FAIL, "Class App\Models\MuscleGroup not found".

- [ ] **Step 3: Scrivi la migrazione**

Crea `backend/database/migrations/2026_09_07_100200_create_taxonomy_tables.php`:

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * I gruppi muscolari e gli attrezzi, che fin qui erano due union TypeScript
 * dentro `src/types/gym.ts` e nient'altro.
 *
 * Diventano righe perche' un esercizio nuovo non deve poter nascere con un
 * gruppo muscolare scritto a modo suo, e perche' aggiungerne uno non deve
 * costare un rilascio dell'app.
 *
 * LO SLUG NON CAMBIA MAI. E' quel che sta scritto in colonna sugli esercizi:
 * rinominare "Femorali" in "Ischiocrurali" cambia `label_it`, non `slug`, o
 * ogni esercizio che lo nomina resterebbe orfano senza che niente lo dica.
 * L'etichetta e' in due colonne e non in una chiave i18n perche' un gruppo
 * aggiunto dal gestionale deve arrivare all'app gia' scritto: una chiave
 * rimanderebbe a un file di traduzione che sul telefono e' quello del
 * rilascio, cioe' senza quella voce.
 */
return new class extends Migration
{
    public function up(): void
    {
        foreach (['muscle_groups', 'equipment_types'] as $name) {
            Schema::create($name, function (Blueprint $table) {
                $table->id();
                $table->string('slug', 40)->unique();
                $table->string('label_it', 60);
                $table->string('label_en', 60);
                // L'ordine in cui si mostrano: alfabetico metterebbe
                // "addome" prima di "petto", e nessuno pensa il corpo in
                // ordine alfabetico.
                $table->integer('sort')->default(0);
                $table->softDeletes();
                $table->timestamps();
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('equipment_types');
        Schema::dropIfExists('muscle_groups');
    }
};
```

- [ ] **Step 4: Scrivi i due model**

Crea `backend/app/Models/MuscleGroup.php`:

```php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * Un gruppo muscolare del catalogo.
 *
 * `slug` non e' modificabile dopo la creazione, e il divieto sta nel
 * controller che lo scrive: e' la chiave che gli esercizi hanno in colonna.
 */
#[Fillable(['slug', 'label_it', 'label_en', 'sort'])]
class MuscleGroup extends Model
{
    use SoftDeletes;
}
```

Crea `backend/app/Models/EquipmentType.php`:

```php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * Un attrezzo del catalogo.
 *
 * Il model si chiama `EquipmentType` e non `Equipment` perche' "equipment" e'
 * gia' plurale in inglese: Eloquent cercherebbe la tabella `equipment`, ed e'
 * lo stesso inciampo che `Food` risolve con `$table`. Qui si risolve col nome,
 * che e' anche piu' onesto - una riga e' un tipo di attrezzo, non un attrezzo.
 */
#[Fillable(['slug', 'label_it', 'label_en', 'sort'])]
class EquipmentType extends Model
{
    use SoftDeletes;
}
```

- [ ] **Step 5: Scrivi il seeder**

Crea `backend/database/seeders/TaxonomySeeder.php`:

```php
<?php

namespace Database\Seeders;

use App\Models\EquipmentType;
use App\Models\MuscleGroup;
use Illuminate\Database\Seeder;

/**
 * I dodici gruppi e gli undici attrezzi che l'app conosce oggi.
 *
 * Le etichette sono copiate da `gym.muscle.*` e `gym.equipment.*` di
 * `src/i18n/locales/it.json` e `en.json`: sono le stesse parole che l'utente
 * vede gia', e cambiarle qui sarebbe un cambio di prodotto travestito da
 * migrazione.
 *
 * Idempotente per slug: gira a ogni deploy senza duplicare niente e senza
 * riscrivere un'etichetta che l'amministratore ha corretto dal gestionale.
 */
class TaxonomySeeder extends Seeder
{
    /** slug => [it, en, ordine] */
    private const MUSCLE_GROUPS = [
        'petto' => ['Petto', 'Chest', 10],
        'schiena' => ['Schiena', 'Back', 20],
        'spalle' => ['Spalle', 'Shoulders', 30],
        'bicipiti' => ['Bicipiti', 'Biceps', 40],
        'tricipiti' => ['Tricipiti', 'Triceps', 50],
        'avambracci' => ['Avambracci', 'Forearms', 60],
        'addome' => ['Addome', 'Abs', 70],
        'quadricipiti' => ['Quadricipiti', 'Quads', 80],
        'femorali' => ['Femorali', 'Hamstrings', 90],
        'glutei' => ['Glutei', 'Glutes', 100],
        'polpacci' => ['Polpacci', 'Calves', 110],
        'full_body' => ['Full body', 'Full body', 120],
    ];

    private const EQUIPMENT = [
        'corpo_libero' => ['Corpo libero', 'Bodyweight', 10],
        'bilanciere' => ['Bilanciere', 'Barbell', 20],
        'manubri' => ['Manubri', 'Dumbbells', 30],
        'kettlebell' => ['Kettlebell', 'Kettlebell', 40],
        'cavi' => ['Cavi', 'Cables', 50],
        'macchina' => ['Macchina', 'Machine', 60],
        'panca' => ['Panca', 'Bench', 70],
        'sbarra' => ['Sbarra', 'Pull-up bar', 80],
        'elastici' => ['Elastici', 'Resistance bands', 90],
        'trx' => ['TRX', 'TRX', 100],
        'cardio' => ['Cardio', 'Cardio', 110],
    ];

    public function run(): void
    {
        foreach (self::MUSCLE_GROUPS as $slug => [$it, $en, $sort]) {
            MuscleGroup::firstOrCreate(
                ['slug' => $slug],
                ['label_it' => $it, 'label_en' => $en, 'sort' => $sort],
            );
        }

        foreach (self::EQUIPMENT as $slug => [$it, $en, $sort]) {
            EquipmentType::firstOrCreate(
                ['slug' => $slug],
                ['label_it' => $it, 'label_en' => $en, 'sort' => $sort],
            );
        }
    }
}
```

- [ ] **Step 6: Verifica le etichette contro l'app**

Le etichette sopra devono combaciare con quelle che l'utente vede gia'. Controllale:

```bash
cd /Users/martintrajkovski/Desktop/Progetti-personali/KalTrack
python3 -c "import json;d=json.load(open('src/i18n/locales/it.json'));print(json.dumps(d['gym']['muscle'],ensure_ascii=False,indent=1));print(json.dumps(d['gym']['equipment'],ensure_ascii=False,indent=1))"
python3 -c "import json;d=json.load(open('src/i18n/locales/en.json'));g=d.get('gym',{});print(json.dumps(g.get('muscle',{}),ensure_ascii=False,indent=1));print(json.dumps(g.get('equipment',{}),ensure_ascii=False,indent=1))"
```

Correggi il seeder dove diverge. Se una chiave manca in `en.json` - il `CLAUDE.md` avverte che non e' completo - tieni la traduzione scritta sopra e **aggiungila anche a `en.json`** nello stesso giro, o quella stringa non si tradurra' mai piu' in app.

- [ ] **Step 7: Registra il seeder**

In `backend/database/seeders/DatabaseSeeder.php`, dentro `run()`, aggiungi:

```php
        $this->call(TaxonomySeeder::class);
```

- [ ] **Step 8: Lancia i test e verifica che passino**

```bash
cd backend && php artisan test --filter=TaxonomyTest
```

Atteso: PASS, 3 test.

- [ ] **Step 9: Commit**

```bash
cd backend && git add database/migrations/2026_09_07_100200_create_taxonomy_tables.php app/Models/MuscleGroup.php app/Models/EquipmentType.php database/seeders/TaxonomySeeder.php database/seeders/DatabaseSeeder.php tests/Feature/TaxonomyTest.php
git commit -m "feat(catalogo): gruppi muscolari e attrezzatura diventano tabelle"
```

Se hai toccato `en.json`, committalo dal repository dell'app con un commit suo.

---

### Task 4: L'interruttore AI

**Files:**
- Create: `backend/database/migrations/2026_09_07_100300_add_ai_enabled_to_users.php`
- Modify: `backend/app/Models/User.php`
- Modify: `backend/app/Http/Controllers/Api/ProfileController.php` (metodo `me`)
- Test: `backend/tests/Feature/AdminTest.php`

**Interfaces:**
- Produces: colonna `users.ai_enabled` (boolean, default `true`), cast a `boolean`, e la chiave `aiEnabled` dentro la risposta di `GET /api/me`.

- [ ] **Step 1: Scrivi il test che fallisce**

In `backend/tests/Feature/AdminTest.php`, aggiungi dentro la classe:

```php
    public function test_il_profilo_dice_se_l_ai_e_attiva(): void
    {
        $user = \App\Models\User::factory()->create();

        $this->actingAs($user)
            ->getJson('/api/me')
            ->assertOk()
            ->assertJsonPath('aiEnabled', true);

        $user->update(['ai_enabled' => false]);

        $this->actingAs($user)
            ->getJson('/api/me')
            ->assertOk()
            ->assertJsonPath('aiEnabled', false);
    }
```

- [ ] **Step 2: Lancia il test e verifica che fallisca**

```bash
cd backend && php artisan test --filter=test_il_profilo_dice_se_l_ai_e_attiva
```

Atteso: FAIL, "table users has no column named ai_enabled".

- [ ] **Step 3: Scrivi la migrazione**

Crea `backend/database/migrations/2026_09_07_100300_add_ai_enabled_to_users.php`:

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Chi ha diritto alle funzioni AI.
 *
 * ACCESA DI SERIE, al contrario di `is_admin` che nasce spenta. Un permesso si
 * concede, ma questo non e' un permesso nuovo: oggi l'AI e' attiva per
 * chiunque, gratuita, con la chiave nel bundle dell'app. Nascere spenta la
 * toglierebbe a tutti quelli che la usano gia'. Il default si rovescia il
 * giorno in cui le chiamate passano dal backend e si comincia a pagarle
 * (`TODO.md` § 3.1), e da quel giorno la colonna diventa un diritto da
 * concedere.
 *
 * FINCHE' QUEL GIORNO NON ARRIVA, QUESTA COLONNA E' UN CARTELLO E NON UNA
 * SERRATURA. La chiave Gemini sta nel bundle e le chiamate partono dal
 * telefono: spegnerla nasconde il microfono e nient'altro, e chi
 * ripacchettizza l'APK lo riaccende. Sta qui perche' l'amministratore possa
 * gia' regalare l'AI a chi vuole, non perche' protegga qualcosa.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->boolean('ai_enabled')->default(true);
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('ai_enabled');
        });
    }
};
```

- [ ] **Step 4: Aggiorna il model**

In `backend/app/Models/User.php`: nell'attributo `#[Fillable([...])]` aggiungi `'ai_enabled',` dopo `'is_admin',`; in `casts()` aggiungi `'ai_enabled' => 'boolean',`.

- [ ] **Step 5: Esponi il campo in `GET /api/me`**

In `backend/app/Http/Controllers/Api/ProfileController.php`, dentro `me()`, dopo la riga `'isAdmin' => $user->is_admin,` aggiungi:

```php
            /*
             * L'app lo legge per non montare `AssistantButton` a interruttore
             * spento. E' un cartello e non una serratura finche' le chiamate
             * AI partono dal telefono: vedi la migrazione che ha creato la
             * colonna.
             */
            'aiEnabled' => $user->ai_enabled,
```

- [ ] **Step 6: Lancia i test e verifica che passino**

```bash
cd backend && php artisan test --filter=AdminTest
```

Atteso: PASS.

- [ ] **Step 7: Commit**

```bash
cd backend && git add database/migrations/2026_09_07_100300_add_ai_enabled_to_users.php app/Models/User.php app/Http/Controllers/Api/ProfileController.php tests/Feature/AdminTest.php
git commit -m "feat(utenti): interruttore per le funzioni AI"
```

---

### Task 5: L'export del seed dell'app in JSON

**Files:**
- Create: `scripts/export-seed.ts` (nel repository dell'app, **non** in `backend/`)
- Create: `backend/database/seeders/data/exercises.json`
- Create: `backend/database/seeders/data/foods.json`
- Modify: `package.json` (root dell'app)
- Test: `src/db/seed/seed.test.ts`

**Interfaces:**
- Produces: due file JSON committati. `exercises.json` e' un array di `{ uid, name, muscleGroup, secondaryMuscles: string[], equipment: string[], instructions }`; `foods.json` un array di `{ uid, name, kcal, protein, carbs, sugars, fat, saturatedFat, fiber, salt, isLiquid, defaultServingG, servingLabel }`. `uid` e' l'`id` del seed. Comando: `npm run seed:export`.

- [ ] **Step 1: Scrivi il test che fallisce**

In `src/db/seed/seed.test.ts`, aggiungi in fondo al file:

```ts
describe("export del seed per il catalogo del server", () => {
  const leggi = (nome: string): unknown[] =>
    JSON.parse(
      readFileSync(
        join(__dirname, "..", "..", "..", "backend", "database", "seeders", "data", nome),
        "utf8",
      ),
    );

  /*
   * I due JSON sono la copia che il server legge: `catalog:seed` non puo'
   * leggere `src/db/seed/` perche' in produzione `backend/` viaggia da sola
   * (vedi § In produzione in backend/README.md), e quella cartella li' non
   * esiste.
   *
   * Un esercizio aggiunto al seed e non riesportato e' un esercizio che il
   * catalogo non conosce: sui telefoni c'e' e sul server no, quindi il pull
   * lo riproporrebbe come voce nuova e ne nascerebbe un doppione. Senza
   * questo test nessuno se ne accorgerebbe.
   */
  it("ha tante voci quante le costanti", () => {
    expect(leggi("exercises.json")).toHaveLength(SEED_EXERCISES.length);
    expect(leggi("foods.json")).toHaveLength(SEED_FOODS.length);
  });

  it("porta le istruzioni di ogni esercizio", () => {
    const esportati = leggi("exercises.json") as { uid: string; instructions: string }[];
    for (const e of esportati) {
      expect(e.instructions.length).toBeGreaterThan(10);
    }
  });

  it("usa l'id del seed come uid", () => {
    const esportati = leggi("exercises.json") as { uid: string }[];
    const attesi = SEED_EXERCISES.map((e) => e.id).sort();
    expect(esportati.map((e) => e.uid).sort()).toEqual(attesi);
  });
});
```

In cima allo stesso file aggiungi gli import che servono:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SEED_EXERCISES } from "@/src/db/seed/exercises";
import { SEED_FOODS } from "@/src/db/seed/foods";
```

Se `SEED_EXERCISES` o `SEED_FOODS` sono gia' importati nel file, non duplicare l'import.

- [ ] **Step 2: Lancia il test e verifica che fallisca**

```bash
cd /Users/martintrajkovski/Desktop/Progetti-personali/KalTrack
npx jest src/db/seed/seed.test.ts
```

Atteso: FAIL, "ENOENT: no such file or directory ... exercises.json".

- [ ] **Step 3: Installa `tsx`**

Serve per eseguire uno script TypeScript da riga di comando: il progetto non ha un runner del genere, e il seed e' TypeScript con l'alias `@/`.

```bash
cd /Users/martintrajkovski/Desktop/Progetti-personali/KalTrack
npm i -D tsx
```

- [ ] **Step 4: Scrivi lo script di export**

Crea `scripts/export-seed.ts`:

```ts
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { SEED_EXERCISES } from "../src/db/seed/exercises";
import { SEED_FOODS } from "../src/db/seed/foods";

/*
 * Il seed dell'app, in una forma che il server sa leggere.
 *
 * Il comando `catalog:seed` NON legge `src/db/seed/`: in produzione
 * `backend/` viene rsyncata da sola e quella cartella li' non esiste, quindi
 * il comando fallirebbe solo sul server e solo al primo tentativo. Legge
 * invece questi due JSON, che sono committati.
 *
 * Va rilanciato quando il seed cambia. A ricordarlo c'e' un test in
 * `src/db/seed/seed.test.ts` che confronta i conteggi: senza, un esercizio
 * aggiunto e non riesportato diventerebbe un doppione su ogni telefono.
 */

const OUT = join(__dirname, "..", "backend", "database", "seeders", "data");

const scrivi = (nome: string, dati: unknown): void => {
  const percorso = join(OUT, nome);
  mkdirSync(dirname(percorso), { recursive: true });
  writeFileSync(percorso, `${JSON.stringify(dati, null, 2)}\n`, "utf8");
  console.log(`${nome}: ${(dati as unknown[]).length} voci`);
};

scrivi(
  "exercises.json",
  SEED_EXERCISES.map((e) => ({
    uid: e.id,
    name: e.name,
    muscleGroup: e.muscleGroup,
    secondaryMuscles: e.secondaryMuscles,
    equipment: e.equipment,
    instructions: e.instructions,
  })),
);

scrivi(
  "foods.json",
  SEED_FOODS.map((f) => ({
    uid: f.id,
    name: f.name,
    kcal: f.nutrients.kcal,
    protein: f.nutrients.protein,
    carbs: f.nutrients.carbs,
    sugars: f.nutrients.sugars,
    fat: f.nutrients.fat,
    saturatedFat: f.nutrients.saturatedFat,
    fiber: f.nutrients.fiber,
    salt: f.nutrients.salt,
    isLiquid: f.isLiquid ?? false,
    defaultServingG: f.defaultServingG ?? null,
    servingLabel: f.servingLabel ?? null,
  })),
);
```

- [ ] **Step 5: Aggiungi lo script a `package.json`**

In `package.json` alla root dell'app, dentro `"scripts"`, aggiungi:

```json
    "seed:export": "tsx scripts/export-seed.ts",
```

- [ ] **Step 6: Genera i due file**

```bash
cd /Users/martintrajkovski/Desktop/Progetti-personali/KalTrack
npm run seed:export
```

Atteso: due righe, `exercises.json: 200 voci` e `foods.json: N voci`. Se il numero degli esercizi non e' 200, non correggerlo: e' il numero vero del seed, ed e' il test a doverlo seguire.

- [ ] **Step 7: Lancia il test e verifica che passi**

```bash
cd /Users/martintrajkovski/Desktop/Progetti-personali/KalTrack
npx jest src/db/seed/seed.test.ts
```

Atteso: PASS.

- [ ] **Step 8: Commit**

Due repository nella stessa cartella? No: `backend/` sta dentro il repo dell'app, un commit solo.

```bash
cd /Users/martintrajkovski/Desktop/Progetti-personali/KalTrack
git add scripts/export-seed.ts package.json package-lock.json src/db/seed/seed.test.ts backend/database/seeders/data/
git commit -m "feat(catalogo): esporta il seed dell'app in JSON per il server"
```

---

### Task 6: Il comando `catalog:seed`

**Files:**
- Create: `backend/app/Console/Commands/SeedCatalog.php`
- Test: `backend/tests/Feature/SeedCatalogTest.php`

**Interfaces:**
- Consumes: `backend/database/seeders/data/exercises.json` e `foods.json` dal Task 5; le colonne `uid`/`status`/`instructions` dai Task 1 e 2.
- Produces: comando `php artisan catalog:seed`, idempotente per `uid`, che inserisce le voci mancanti come `published` e **non tocca** quelle che ci sono.

- [ ] **Step 1: Scrivi il test che fallisce**

Crea `backend/tests/Feature/SeedCatalogTest.php`:

```php
<?php

namespace Tests\Feature;

use App\Models\Exercise;
use App\Models\Food;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SeedCatalogTest extends TestCase
{
    use RefreshDatabase;

    public function test_carica_il_catalogo_come_pubblicato(): void
    {
        $this->artisan('catalog:seed')->assertSuccessful();

        $panca = Exercise::where('uid', 'ex-panca-piana-bilanciere')->first();

        $this->assertNotNull($panca);
        $this->assertSame('published', $panca->status);
        $this->assertSame('petto', $panca->muscle_group);
        $this->assertNotEmpty($panca->instructions);
        // Gli elenchi viaggiano separati da virgole, come in colonna.
        $this->assertStringContainsString('bilanciere', $panca->equipment);
        // Nessun autore: il seed non e' di nessuno.
        $this->assertNull($panca->created_by);
    }

    public function test_e_idempotente(): void
    {
        $this->artisan('catalog:seed')->assertSuccessful();
        $primo = Exercise::count();
        $primoCibo = Food::count();

        $this->artisan('catalog:seed')->assertSuccessful();

        $this->assertSame($primo, Exercise::count());
        $this->assertSame($primoCibo, Food::count());
    }

    public function test_non_riscrive_una_voce_gia_corretta(): void
    {
        $this->artisan('catalog:seed')->assertSuccessful();

        Exercise::where('uid', 'ex-panca-piana-bilanciere')
            ->update(['instructions' => 'Istruzione corretta a mano.']);

        $this->artisan('catalog:seed')->assertSuccessful();

        $this->assertSame(
            'Istruzione corretta a mano.',
            Exercise::where('uid', 'ex-panca-piana-bilanciere')->first()->instructions,
        );
    }

    public function test_non_riporta_indietro_una_voce_cancellata(): void
    {
        $this->artisan('catalog:seed')->assertSuccessful();

        Exercise::where('uid', 'ex-panca-piana-bilanciere')->first()->delete();

        $this->artisan('catalog:seed')->assertSuccessful();

        $this->assertNull(Exercise::where('uid', 'ex-panca-piana-bilanciere')->first());
    }

    public function test_carica_anche_gli_alimenti(): void
    {
        $this->artisan('catalog:seed')->assertSuccessful();

        $pasta = Food::where('uid', 'seed-pasta-semola-cruda')->first();

        $this->assertNotNull($pasta);
        $this->assertSame('published', $pasta->status);
        $this->assertEqualsWithDelta(353.0, $pasta->kcal, 0.01);
    }
}
```

- [ ] **Step 2: Lancia il test e verifica che fallisca**

```bash
cd backend && php artisan test --filter=SeedCatalogTest
```

Atteso: FAIL, "The command 'catalog:seed' does not exist".

- [ ] **Step 3: Scrivi il comando**

Crea `backend/app/Console/Commands/SeedCatalog.php`:

```php
<?php

namespace App\Console\Commands;

use App\Models\Exercise;
use App\Models\Food;
use App\Support\Text;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;

/**
 * Carica nel catalogo del server il seed che l'app si porta dietro.
 *
 * SENZA QUESTO COMANDO IL PRIMO PULL DUPLICA DUECENTO ESERCIZI SU OGNI
 * TELEFONO. Il seed li ha inseriti in locale con i suoi id, il catalogo del
 * server non li conosce, e il confronto per `uid` non troverebbe niente: al
 * telefono arriverebbero come voci nuove da aggiungere accanto a quelle che
 * ha gia'.
 *
 * Legge i due JSON di `database/seeders/data/` e non `src/db/seed/`: in
 * produzione `backend/` viene rsyncata da sola, e quella cartella li' non
 * esiste. I due file si rigenerano dall'app con `npm run seed:export`.
 *
 * IDEMPOTENTE PER `uid`, e in un senso preciso: inserisce cio' che manca e non
 * tocca cio' che c'e'. Una voce che l'amministratore ha corretto dal
 * gestionale resta corretta, e una che ha cancellato resta cancellata - il
 * soft delete la tiene in tabella, quindi il comando la ritrova e la salta.
 * E' la stessa regola di `applyExerciseSeeds` sul telefono, e per lo stesso
 * motivo: chi decide vince sul seed.
 */
class SeedCatalog extends Command
{
    protected $signature = 'catalog:seed';

    protected $description = 'Carica nel catalogo comune gli esercizi e gli alimenti del seed dell\'app';

    public function handle(): int
    {
        $esercizi = $this->carica('exercises.json');
        $alimenti = $this->carica('foods.json');

        if ($esercizi === null || $alimenti === null) {
            return self::FAILURE;
        }

        $nuoviEsercizi = $this->seminaEsercizi($esercizi);
        $nuoviAlimenti = $this->seminaAlimenti($alimenti);

        $this->info("Esercizi aggiunti: {$nuoviEsercizi}");
        $this->info("Alimenti aggiunti: {$nuoviAlimenti}");

        Log::info('[catalogo] seed applicato', [
            'esercizi' => $nuoviEsercizi,
            'alimenti' => $nuoviAlimenti,
        ]);

        return self::SUCCESS;
    }

    /** @return array<int, array<string, mixed>>|null */
    private function carica(string $nome): ?array
    {
        $percorso = database_path("seeders/data/{$nome}");

        if (! is_file($percorso)) {
            $this->error("Manca {$percorso}. Lancia `npm run seed:export` dall'app.");

            return null;
        }

        $dati = json_decode((string) file_get_contents($percorso), true);

        if (! is_array($dati)) {
            $this->error("{$nome} non e' un JSON valido.");

            return null;
        }

        return $dati;
    }

    /** @param array<int, array<string, mixed>> $voci */
    private function seminaEsercizi(array $voci): int
    {
        // Un solo giro sul database invece di duecento SELECT: il comando gira
        // all'avvio del container, e duecento andate e ritorni su un file
        // SQLite montato su volume si sentono.
        $presenti = Exercise::withTrashed()->pluck('uid')->flip();
        $nuovi = 0;

        foreach ($voci as $v) {
            if ($presenti->has($v['uid'])) {
                continue;
            }

            Exercise::create([
                'uid' => $v['uid'],
                'name' => $v['name'],
                'name_norm' => Text::normalize($v['name']),
                'muscle_group' => $v['muscleGroup'],
                'secondary_muscles' => implode(',', $v['secondaryMuscles'] ?? []) ?: null,
                'equipment' => implode(',', $v['equipment'] ?? []) ?: null,
                'instructions' => $v['instructions'] ?? null,
                'status' => 'published',
                // Il seed non e' di nessuno: `created_by` nullo vuol dire che
                // nessun utente puo' correggerlo dall'app, e va bene cosi' -
                // si corregge dal gestionale.
                'created_by' => null,
            ]);
            $nuovi++;
        }

        return $nuovi;
    }

    /** @param array<int, array<string, mixed>> $voci */
    private function seminaAlimenti(array $voci): int
    {
        $presenti = Food::withTrashed()->pluck('uid')->flip();
        $nuovi = 0;

        foreach ($voci as $v) {
            if ($presenti->has($v['uid'])) {
                continue;
            }

            Food::create([
                'uid' => $v['uid'],
                'name' => $v['name'],
                'name_norm' => Text::normalize($v['name']),
                'kcal' => $v['kcal'],
                'protein' => $v['protein'],
                'carbs' => $v['carbs'],
                'sugars' => $v['sugars'],
                'fat' => $v['fat'],
                'saturated_fat' => $v['saturatedFat'],
                'fiber' => $v['fiber'],
                'salt' => $v['salt'],
                'is_liquid' => $v['isLiquid'],
                'default_serving_g' => $v['defaultServingG'],
                'serving_label' => $v['servingLabel'],
                'status' => 'published',
                'created_by' => null,
            ]);
            $nuovi++;
        }

        return $nuovi;
    }
}
```

- [ ] **Step 4: Lancia i test e verifica che passino**

```bash
cd backend && php artisan test --filter=SeedCatalogTest
```

Atteso: PASS, 5 test.

Se `test_carica_il_catalogo_come_pubblicato` fallisce su `name_norm` duplicato, vuol dire che il seed dell'app contiene due nomi che si normalizzano uguali. Non aggirarlo con un `firstOrCreate`: il vincolo unico su `name_norm` e' la deduplica del catalogo e sta facendo il suo mestiere. Correggi il nome nel seed dell'app, riesporta, e rilancia.

- [ ] **Step 5: Lancialo davvero, contro il database di sviluppo**

```bash
cd backend && php artisan catalog:seed
```

Atteso: due righe con i conteggi. Rilancialo: la seconda volta deve dire zero e zero.

- [ ] **Step 6: Aggiungilo all'entrypoint del container**

In `backend/docker/` c'e' lo script che l'entrypoint lancia all'avvio, quello che gia' fa `php artisan migrate --force`. Trovalo:

```bash
cd backend && grep -rn "artisan migrate" docker/ Dockerfile
```

Subito **dopo** la riga della migrazione aggiungi:

```sh
php artisan catalog:seed
```

Deve stare dopo, non prima: prima delle migrazioni le colonne `uid` e `status` non esistono ancora e il comando fallirebbe a ogni avvio del container.

- [ ] **Step 7: Commit**

```bash
cd backend && git add app/Console/Commands/SeedCatalog.php tests/Feature/SeedCatalogTest.php docker/ Dockerfile
git commit -m "feat(catalogo): comando catalog:seed per caricare il seed dell'app"
```

---

### Task 7: Le letture del catalogo filtrano `published`, le scritture creano `pending`

**Files:**
- Modify: `backend/app/Http/Controllers/Api/ExerciseController.php`
- Modify: `backend/app/Http/Controllers/Api/FoodController.php`
- Test: `backend/tests/Feature/ExerciseCatalogTest.php`
- Test: `backend/tests/Feature/FoodCatalogTest.php`

**Interfaces:**
- Consumes: `status` dai Task 1 e 2.
- Produces: `GET /api/exercises` e `GET /api/foods` restituiscono solo `status = 'published'`; `POST` sulle stesse crea `status = 'pending'`; `PATCH` e `DELETE` funzionano solo su una voce propria **e ancora `pending`**. La forma della risposta (`publicShape`) non cambia: le rotte vecchie devono continuare a servire i telefoni gia' installati.

- [ ] **Step 1: Scrivi i test che falliscono**

In `backend/tests/Feature/ExerciseCatalogTest.php`, aggiungi dentro la classe:

```php
    public function test_una_proposta_non_esce_dal_catalogo(): void
    {
        $anna = \App\Models\User::factory()->create();

        $this->actingAs($anna)->postJson('/api/exercises', [
            'name' => 'Spinte con la sedia',
            'muscleGroup' => 'petto',
        ])->assertOk();

        // Nemmeno al suo autore: la voce e' gia' sul suo telefono, e
        // rimandargliela nel catalogo comune direbbe che e' stata pubblicata.
        $this->actingAs($anna)->getJson('/api/exercises')
            ->assertOk()
            ->assertJsonMissing(['name' => 'Spinte con la sedia']);
    }

    public function test_una_proposta_nasce_in_attesa(): void
    {
        $anna = \App\Models\User::factory()->create();

        $this->actingAs($anna)->postJson('/api/exercises', [
            'name' => 'Spinte con la sedia',
            'muscleGroup' => 'petto',
        ])->assertOk();

        $voce = \App\Models\Exercise::where('name_norm', 'spinte con la sedia')->first();
        $this->assertSame('pending', $voce->status);
        $this->assertSame($anna->id, $voce->created_by);
    }

    public function test_una_voce_pubblicata_non_si_corregge_piu_dall_app(): void
    {
        $anna = \App\Models\User::factory()->create();

        $voce = \App\Models\Exercise::create([
            'uid' => 'x-1',
            'name' => 'Spinte',
            'name_norm' => 'spinte',
            'muscle_group' => 'petto',
            'status' => 'published',
            'created_by' => $anna->id,
        ]);

        // Da pubblicata in poi la voce e' di tutti: correggerla la
        // cambierebbe nell'app di chiunque, e quella decisione sta al
        // gestionale. L'autore ha comunque la sua copia sul telefono.
        $this->actingAs($anna)->patchJson("/api/exercises/{$voce->id}", [
            'name' => 'Spinte modificate',
            'muscleGroup' => 'petto',
        ])->assertForbidden();
    }

    public function test_una_proposta_propria_si_corregge_ancora(): void
    {
        $anna = \App\Models\User::factory()->create();

        $voce = \App\Models\Exercise::create([
            'uid' => 'x-2',
            'name' => 'Spinte',
            'name_norm' => 'spinte',
            'muscle_group' => 'petto',
            'status' => 'pending',
            'created_by' => $anna->id,
        ]);

        $this->actingAs($anna)->patchJson("/api/exercises/{$voce->id}", [
            'name' => 'Spinte con la sedia',
            'muscleGroup' => 'petto',
        ])->assertOk();

        $this->assertSame('Spinte con la sedia', $voce->fresh()->name);
    }
```

In `backend/tests/Feature/FoodCatalogTest.php`, aggiungi gli stessi due primi casi adattati agli alimenti:

```php
    public function test_una_proposta_non_esce_dal_catalogo(): void
    {
        $anna = \App\Models\User::factory()->create();

        $this->actingAs($anna)->postJson('/api/foods', [
            'name' => 'Pasta della Lidl',
            'kcal' => 353,
        ])->assertOk();

        $this->actingAs($anna)->getJson('/api/foods')
            ->assertOk()
            ->assertJsonMissing(['name' => 'Pasta della Lidl']);

        $voce = \App\Models\Food::where('name_norm', 'pasta della lidl')->first();
        $this->assertSame('pending', $voce->status);
        $this->assertSame($anna->id, $voce->created_by);
    }
```

- [ ] **Step 2: Lancia i test e verifica che falliscano**

```bash
cd backend && php artisan test --filter="ExerciseCatalogTest|FoodCatalogTest"
```

Atteso: FAIL sui casi nuovi. I casi che c'erano gia' devono ancora passare: se uno di quelli si rompe, il codice nuovo ha cambiato qualcosa che doveva restare.

- [ ] **Step 3: Filtra la lettura degli esercizi**

In `backend/app/Http/Controllers/Api/ExerciseController.php`, dentro `index()`, nella catena della query aggiungi il filtro come **prima** condizione:

```php
        $exercises = Exercise::query()
            /*
             * Solo il catalogo, non le proposte.
             *
             * Nemmeno le proprie: chi ha proposto una voce ce l'ha gia' sul
             * telefono, e vedersela tornare dal catalogo comune vorrebbe dire
             * che e' stata pubblicata, che non e' vero.
             */
            ->where('status', 'published')
            ->when($term !== '', fn ($q) => $q->where('name_norm', 'LIKE', "%{$term}%"))
```

- [ ] **Step 4: Fai nascere le proposte in attesa**

Nello stesso file, dentro `store()`, nell'array del `firstOrCreate` aggiungi lo stato:

```php
        $exercise = Exercise::firstOrCreate(
            ['name_norm' => $norm],
            [
                'uid' => (string) Str::uuid(),
                'name' => trim($validated['name']),
                'muscle_group' => $validated['muscleGroup'],
                'secondary_muscles' => $validated['secondaryMuscles'] ?? null,
                'equipment' => $validated['equipment'] ?? null,
                'created_by' => $request->user()->id,
                /*
                 * Fin qui una voce creata a mano entrava nell'elenco di
                 * chiunque, e la migrazione della tabella lo dichiarava. Da
                 * qui in poi si propone e basta: entra quando
                 * l'amministratore lo decide, dal gestionale.
                 */
                'status' => 'pending',
            ],
        );
```

Aggiungi `use Illuminate\Support\Str;` agli import del file.

- [ ] **Step 5: Restringi correzione e cancellazione alle proposte proprie**

Nello stesso file, modifica `soloIlProprietario` perche' guardi anche lo stato, e cambiane il nome in `soloLaPropriaProposta`:

```php
    /**
     * Il controllo di proprieta', in un posto solo.
     *
     * Torna la risposta di rifiuto, o null se si puo' procedere.
     *
     * Due condizioni e non una: la voce dev'essere di chi chiede E dev'essere
     * ancora in attesa. Da pubblicata in poi non e' piu' sua - e' nell'app di
     * tutti - e correggerla la cambierebbe a chiunque. La sua copia ce l'ha
     * comunque sul telefono, dove nessuno gliela tocca.
     *
     * La stessa risposta per tutti i casi: distinguere "non e' tua" da "e'
     * gia' pubblicata" direbbe a chi prova qualcosa che non gli riguarda.
     */
    private function soloLaPropriaProposta(Request $request, Exercise $exercise): ?JsonResponse
    {
        $mia = $exercise->created_by !== null
            && $exercise->created_by === $request->user()->id;

        if ($mia && $exercise->status === 'pending') {
            return null;
        }

        return response()->json([
            'message' => 'Puoi modificare solo le proposte che hai fatto tu e che non sono ancora state pubblicate.',
        ], 403);
    }
```

E aggiorna le due chiamate, in `update()` e `destroy()`:

```php
        if ($negato = $this->soloLaPropriaProposta($request, $exercise)) {
            return $negato;
        }
```

- [ ] **Step 6: Ripeti le tre modifiche su `FoodController`**

Le stesse identiche tre: `->where('status', 'published')` come prima condizione di `index()`; `'uid' => (string) Str::uuid()` e `'status' => 'pending'` nel `firstOrCreate` di `store()`; `soloIlProprietario` che diventa `soloLaPropriaProposta(Request $request, Food $food)` con la doppia condizione, e il messaggio con "proposte" invece di "voci". Aggiungi `use Illuminate\Support\Str;` agli import.

- [ ] **Step 7: Lancia i test e verifica che passino**

```bash
cd backend && php artisan test --filter="ExerciseCatalogTest|FoodCatalogTest"
```

Atteso: PASS, quelli vecchi e quelli nuovi.

Se un test vecchio ora fallisce perche' si aspettava di ritrovare in `GET` una voce appena creata con `POST`, e' un test che descriveva il comportamento **precedente**: aggiornalo, e scrivi nel commit che quel comportamento e' cambiato di proposito.

- [ ] **Step 8: Lancia l'intera suite**

```bash
cd backend && php artisan test
```

Atteso: PASS.

- [ ] **Step 9: Commit**

```bash
cd backend && git add app/Http/Controllers/Api/ExerciseController.php app/Http/Controllers/Api/FoodController.php tests/Feature/ExerciseCatalogTest.php tests/Feature/FoodCatalogTest.php
git commit -m "feat(catalogo): cio' che si crea si propone, non si pubblica"
```

---

### Task 8: Il pull incrementale del catalogo

**Files:**
- Create: `backend/app/Http/Controllers/Api/CatalogController.php`
- Modify: `backend/routes/api.php`
- Test: `backend/tests/Feature/CatalogPullTest.php`

**Interfaces:**
- Consumes: `uid`, `status`, `deleted_at`, `instructions`, `photo` dai Task 1 e 2.
- Produces: `GET /api/catalog/exercises` e `GET /api/catalog/foods`, con parametri `since` (ISO 8601) e `afterId` (intero). La risposta e' `{ "data": [...], "next": { "since": "...", "afterId": 123 } | null }`. Ogni voce porta `uid`; una voce cancellata porta **solo** `uid` e `deletedAt`.

- [ ] **Step 1: Capisci perche' il cursore e' una coppia**

Non saltare questo passo, o il codice che scrivi sara' sottilmente rotto.

Laravel salva i timestamp con precisione al secondo. `catalog:seed` inserisce duecento esercizi **nello stesso secondo**, quindi duecento righe hanno lo stesso `updated_at`. Un cursore fatto del solo `updated_at` con `>` salterebbe centonovantanove righe al secondo giro; con `>=` le rimanderebbe tutte all'infinito.

Il cursore e' quindi la coppia `(updated_at, id)`, ordinata su entrambe, e la condizione e' "updated_at maggiore, **oppure** uguale e id maggiore". E' la paginazione a chiave, e qui non e' un'ottimizzazione ma la sola forma corretta.

- [ ] **Step 2: Scrivi il test che fallisce**

Crea `backend/tests/Feature/CatalogPullTest.php`:

```php
<?php

namespace Tests\Feature;

use App\Models\Exercise;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CatalogPullTest extends TestCase
{
    use RefreshDatabase;

    private function anna(): User
    {
        return User::factory()->create();
    }

    private function esercizio(string $uid, string $nome, string $stato = 'published'): Exercise
    {
        return Exercise::create([
            'uid' => $uid,
            'name' => $nome,
            'name_norm' => \App\Support\Text::normalize($nome),
            'muscle_group' => 'petto',
            'instructions' => 'Come si fa.',
            'status' => $stato,
        ]);
    }

    public function test_il_primo_pull_porta_il_catalogo_pubblicato(): void
    {
        $this->esercizio('a', 'Panca piana');
        $this->esercizio('b', 'Croci', 'pending');

        $this->actingAs($this->anna())
            ->getJson('/api/catalog/exercises')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.uid', 'a')
            ->assertJsonPath('data.0.instructions', 'Come si fa.');
    }

    public function test_il_primo_pull_non_porta_i_cancellati(): void
    {
        // Una voce cancellata prima che questo telefono l'abbia mai vista non
        // ha niente da raccontare: mandargli un tombstone per una riga che non
        // ha vorrebbe dire fargli cercare qualcosa che non esiste.
        $this->esercizio('a', 'Panca piana')->delete();

        $this->actingAs($this->anna())
            ->getJson('/api/catalog/exercises')
            ->assertOk()
            ->assertJsonCount(0, 'data');
    }

    public function test_il_pull_incrementale_porta_solo_il_cambiato(): void
    {
        $vecchio = $this->esercizio('a', 'Panca piana');
        $vecchio->forceFill(['updated_at' => '2026-01-01 10:00:00'])->saveQuietly();

        $this->esercizio('b', 'Croci');

        $risposta = $this->actingAs($this->anna())
            ->getJson('/api/catalog/exercises?since=2026-06-01T00:00:00Z')
            ->assertOk();

        $risposta->assertJsonCount(1, 'data')->assertJsonPath('data.0.uid', 'b');
    }

    public function test_il_pull_incrementale_porta_i_cancellati(): void
    {
        $voce = $this->esercizio('a', 'Panca piana');
        $voce->delete();

        $risposta = $this->actingAs($this->anna())
            ->getJson('/api/catalog/exercises?since=2020-01-01T00:00:00Z')
            ->assertOk();

        $risposta->assertJsonPath('data.0.uid', 'a')
            ->assertJsonPath('data.0.name', null);
        $this->assertNotNull($risposta->json('data.0.deletedAt'));
    }

    public function test_il_cursore_non_salta_righe_con_lo_stesso_istante(): void
    {
        // E' il caso che rompe un cursore fatto del solo timestamp: duecento
        // righe scritte da `catalog:seed` nello stesso secondo.
        for ($i = 1; $i <= 5; $i++) {
            $this->esercizio("uid-{$i}", "Esercizio {$i}");
        }
        Exercise::query()->update(['updated_at' => '2026-09-07 12:00:00']);

        $viste = [];
        $query = '?since=2020-01-01T00:00:00Z&limit=2';

        do {
            $r = $this->actingAs($this->anna())
                ->getJson("/api/catalog/exercises{$query}")
                ->assertOk();

            foreach ($r->json('data') as $voce) {
                $viste[] = $voce['uid'];
            }

            $next = $r->json('next');
            if ($next) {
                $query = '?since='.urlencode($next['since'])
                    .'&afterId='.$next['afterId'].'&limit=2';
            }
        } while ($next !== null);

        sort($viste);
        $this->assertSame(['uid-1', 'uid-2', 'uid-3', 'uid-4', 'uid-5'], $viste);
    }

    public function test_senza_account_non_si_legge_niente(): void
    {
        $this->getJson('/api/catalog/exercises')->assertUnauthorized();
    }
}
```

- [ ] **Step 3: Lancia il test e verifica che fallisca**

```bash
cd backend && php artisan test --filter=CatalogPullTest
```

Atteso: FAIL, 404 su `/api/catalog/exercises`.

- [ ] **Step 4: Scrivi il controller**

Crea `backend/app/Http/Controllers/Api/CatalogController.php`:

```php
<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Exercise;
use App\Models\Food;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

/**
 * Il catalogo comune, per l'app.
 *
 * Sostituisce l'`index` di `ExerciseController` e `FoodController` nel giorno
 * in cui l'app sara' aggiornata, ma non lo cancella: un telefono con la build
 * di ieri continua a chiamare `/api/exercises` e deve continuare a
 * funzionare. Le due letture vecchie restano finche' non serviranno piu' a
 * nessuno.
 *
 * QUEL CHE CAMBIA E' CHE QUESTA E' INCREMENTALE. La vecchia mandava tutto il
 * catalogo ogni volta e il telefono inseriva cio' che gli mancava; qui si
 * manda `since` e torna cio' che e' cambiato dopo, cancellazioni comprese. E'
 * la differenza fra un catalogo che si integra e uno che si aggiorna, ed e'
 * l'unica forma in cui una descrizione corretta dal gestionale puo' arrivare
 * su una riga che il telefono ha gia'.
 */
class CatalogController extends Controller
{
    /** Quante voci per pagina, e il tetto a quante se ne possono chiedere. */
    private const PER_PAGE = 200;

    public function exercises(Request $request): JsonResponse
    {
        return $this->pull($request, Exercise::query(), fn (Exercise $e) => [
            'uid' => $e->uid,
            'name' => $e->name,
            'nameNorm' => $e->name_norm,
            'muscleGroup' => $e->muscle_group,
            'secondaryMuscles' => $e->secondary_muscles,
            'equipment' => $e->equipment,
            'instructions' => $e->instructions,
            'photo' => $e->photo,
        ]);
    }

    public function foods(Request $request): JsonResponse
    {
        return $this->pull($request, Food::query(), fn (Food $f) => [
            'uid' => $f->uid,
            'name' => $f->name,
            'nameNorm' => $f->name_norm,
            'brand' => $f->brand,
            'barcode' => $f->barcode,
            'offId' => $f->off_id,
            'kcal' => $f->kcal,
            'protein' => $f->protein,
            'carbs' => $f->carbs,
            'sugars' => $f->sugars,
            'fat' => $f->fat,
            'saturatedFat' => $f->saturated_fat,
            'fiber' => $f->fiber,
            'salt' => $f->salt,
            'isLiquid' => $f->is_liquid,
            'defaultServingG' => $f->default_serving_g,
            'servingLabel' => $f->serving_label,
            'image' => $f->image,
        ]);
    }

    /**
     * Una pagina di catalogo, dalla coppia (updated_at, id) in poi.
     *
     * IL CURSORE E' UNA COPPIA E NON UN TIMESTAMP, e non e' un
     * raffinamento: Laravel scrive i timestamp al secondo, e `catalog:seed`
     * inserisce duecento righe nello stesso secondo. Con `>` sul solo
     * `updated_at` la seconda pagina salterebbe centonovantanove righe; con
     * `>=` le rimanderebbe per sempre. Il confronto e' quindi "istante
     * maggiore, oppure istante uguale e id maggiore", e l'ordinamento e' su
     * entrambe le colonne.
     *
     * @param  callable(Model): array<string, mixed>  $forma
     */
    private function pull(Request $request, Builder $query, callable $forma): JsonResponse
    {
        $since = $request->query('since');
        $afterId = (int) $request->query('afterId', '0');
        $limit = min((int) $request->query('limit', (string) self::PER_PAGE), self::PER_PAGE);

        /*
         * Le cancellazioni escono SOLO in un pull incrementale.
         *
         * Al primo pull il telefono non ha niente, quindi una voce cancellata
         * non e' qualcosa da togliergli: e' qualcosa che non ha mai avuto, e
         * mandargliene il tombstone gli farebbe cercare una riga inesistente.
         */
        if ($since !== null) {
            $query->withTrashed();
        }

        $query->where('status', 'published');

        if ($since !== null) {
            $da = Carbon::parse($since);

            $query->where(function (Builder $q) use ($da, $afterId) {
                $q->where('updated_at', '>', $da)
                    ->orWhere(function (Builder $q2) use ($da, $afterId) {
                        $q2->where('updated_at', '=', $da)
                            ->where('id', '>', $afterId);
                    });
            });
        }

        $righe = $query
            ->orderBy('updated_at')
            ->orderBy('id')
            ->limit($limit)
            ->get();

        return response()->json([
            'data' => $righe->map(function (Model $riga) use ($forma) {
                /*
                 * Di una voce cancellata esce solo l'identita' e la data.
                 *
                 * Il telefono con quel `uid` non deve riscrivere niente: deve
                 * smettere di considerarla catalogo. Mandarne anche il
                 * contenuto sarebbe un invito a riscriverla, e prima o poi
                 * qualcuno lo farebbe.
                 */
                if ($riga->deleted_at !== null) {
                    return [
                        'uid' => $riga->uid,
                        'deletedAt' => $riga->deleted_at->toIso8601String(),
                    ];
                }

                return [...$forma($riga), 'deletedAt' => null];
            }),
            /*
             * Null quando la pagina non e' piena: non c'e' altro da chiedere.
             * E' la stessa convenzione di `ExerciseController::index`.
             */
            'next' => $righe->count() === $limit
                ? [
                    'since' => $righe->last()->updated_at->toIso8601String(),
                    'afterId' => $righe->last()->id,
                ]
                : null,
        ]);
    }
}
```

- [ ] **Step 5: Registra le rotte**

In `backend/routes/api.php`, dentro il gruppo `auth:sanctum`, **sopra** il blocco `Route::get('exercises', ...)`, aggiungi:

```php
    /*
     * Il catalogo comune, in pull incrementale.
     *
     * Le due letture qui sotto (`exercises`, `foods`) restano per i telefoni
     * con la build di ieri: mandano tutto il catalogo e il telefono ci
     * inserisce cio' che gli manca. Queste due invece mandano cio' che e'
     * cambiato, cancellazioni comprese, ed e' l'unico modo in cui una
     * descrizione corretta arriva su una riga gia' presente.
     */
    Route::get('catalog/exercises', [CatalogController::class, 'exercises']);
    Route::get('catalog/foods', [CatalogController::class, 'foods']);

    /*
     * Proporre, correggere e ritirare una proposta.
     *
     * Sono le stesse azioni di `POST /api/exercises` e compagne, con lo
     * stesso controller: quello che cambia e' solo il percorso, cosi' l'app
     * aggiornata parla di `catalog/` per tutto invece di leggere da una parte
     * e scrivere dall'altra. Le vecchie restano vive per i telefoni che non
     * si sono ancora aggiornati.
     */
    Route::post('catalog/exercises', [ExerciseController::class, 'store'])
        ->middleware('throttle:30,1');
    Route::patch('catalog/exercises/{exercise}', [ExerciseController::class, 'update']);
    Route::delete('catalog/exercises/{exercise}', [ExerciseController::class, 'destroy']);

    Route::post('catalog/foods', [FoodController::class, 'store'])
        ->middleware('throttle:60,1');
    Route::patch('catalog/foods/{food}', [FoodController::class, 'update']);
    Route::delete('catalog/foods/{food}', [FoodController::class, 'destroy']);
```

E in cima al file aggiungi l'import:

```php
use App\Http\Controllers\Api\CatalogController;
```

Nota sul binding: `{exercise}` e `{food}` risolvono per **id**, non per `uid`. La spec scriveva `{uid}`, ed e' un dettaglio che non vale un binding custom: il telefono riceve l'id nella risposta di `POST` e lo usa per le due chiamate successive, esattamente come fa oggi.

- [ ] **Step 6: Lancia i test e verifica che passino**

```bash
cd backend && php artisan test --filter=CatalogPullTest
```

Atteso: PASS, 6 test.

- [ ] **Step 7: Commit**

```bash
cd backend && git add app/Http/Controllers/Api/CatalogController.php routes/api.php tests/Feature/CatalogPullTest.php
git commit -m "feat(catalogo): pull incrementale con cursore a coppia e tombstone"
```

---

### Task 9: Le tassonomie e le foto del catalogo, per l'app

**Files:**
- Modify: `backend/app/Http/Controllers/Api/CatalogController.php`
- Modify: `backend/routes/api.php`
- Test: `backend/tests/Feature/CatalogPullTest.php`

**Interfaces:**
- Consumes: `MuscleGroup`, `EquipmentType` dal Task 3; `CatalogController` dal Task 8.
- Produces: `GET /api/catalog/taxonomies` che torna `{ "muscleGroups": [{uid: slug, slug, labelIt, labelEn, sort, deletedAt}], "equipment": [...] }`, e `GET /api/catalog/images/{name}` che serve i byte da `storage/app/private/catalog/`.

- [ ] **Step 1: Scrivi i test che falliscono**

In `backend/tests/Feature/CatalogPullTest.php`, aggiungi dentro la classe:

```php
    public function test_le_tassonomie_escono_ordinate(): void
    {
        $this->seed(\Database\Seeders\TaxonomySeeder::class);

        $r = $this->actingAs($this->anna())
            ->getJson('/api/catalog/taxonomies')
            ->assertOk();

        $this->assertCount(12, $r->json('muscleGroups'));
        $this->assertCount(11, $r->json('equipment'));
        // L'ordine e' quello di `sort`, non alfabetico: nessuno pensa il
        // corpo in ordine alfabetico.
        $this->assertSame('petto', $r->json('muscleGroups.0.slug'));
        $this->assertSame('Chest', $r->json('muscleGroups.0.labelEn'));
    }

    public function test_una_tassonomia_cancellata_esce_come_tombstone(): void
    {
        $this->seed(\Database\Seeders\TaxonomySeeder::class);
        \App\Models\MuscleGroup::where('slug', 'polpacci')->first()->delete();

        $r = $this->actingAs($this->anna())
            ->getJson('/api/catalog/taxonomies')
            ->assertOk();

        // Esce comunque, con la data: il telefono ha esercizi che nominano
        // quello slug, e togliergli la riga senza dirglielo li lascerebbe
        // senza etichetta e senza un motivo leggibile.
        $polpacci = collect($r->json('muscleGroups'))->firstWhere('slug', 'polpacci');
        $this->assertNotNull($polpacci['deletedAt']);
    }

    public function test_una_foto_di_catalogo_si_scarica(): void
    {
        \Illuminate\Support\Facades\Storage::fake('local');
        \Illuminate\Support\Facades\Storage::disk('local')
            ->put('catalog/abc.jpg', 'byte');

        $this->actingAs($this->anna())
            ->get('/api/catalog/images/abc.jpg')
            ->assertOk();
    }

    public function test_una_foto_di_catalogo_non_si_scarica_senza_account(): void
    {
        $this->get('/api/catalog/images/abc.jpg')->assertUnauthorized();
    }

    public function test_un_nome_di_foto_con_traversata_non_passa(): void
    {
        $this->actingAs($this->anna())
            ->get('/api/catalog/images/..')
            ->assertNotFound();
    }
```

- [ ] **Step 2: Lancia il test e verifica che fallisca**

```bash
cd backend && php artisan test --filter=CatalogPullTest
```

Atteso: FAIL, 404 su `/api/catalog/taxonomies`.

- [ ] **Step 3: Aggiungi i due metodi al controller**

In `backend/app/Http/Controllers/Api/CatalogController.php`, aggiungi gli import:

```php
use App\Models\EquipmentType;
use App\Models\MuscleGroup;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;
```

E dentro la classe, dopo `foods()`:

```php
    /**
     * I gruppi muscolari e gli attrezzi che il catalogo conosce.
     *
     * Escono INTERI a ogni chiamata, cancellati compresi, e non
     * incrementalmente: sono ventitre' righe in tutto, e un cursore su
     * ventitre' righe e' complessita' che non compra niente.
     *
     * I cancellati escono con la loro data invece di sparire. Sul telefono
     * ci sono esercizi che nominano quello slug in colonna: togliere la riga
     * senza dire niente li lascerebbe senza etichetta, e chi la cerca
     * penserebbe a un difetto dell'app.
     */
    public function taxonomies(): JsonResponse
    {
        $forma = fn ($riga) => [
            'slug' => $riga->slug,
            'labelIt' => $riga->label_it,
            'labelEn' => $riga->label_en,
            'sort' => $riga->sort,
            'deletedAt' => $riga->deleted_at?->toIso8601String(),
        ];

        return response()->json([
            'muscleGroups' => MuscleGroup::withTrashed()
                ->orderBy('sort')->orderBy('slug')->get()->map($forma),
            'equipment' => EquipmentType::withTrashed()
                ->orderBy('sort')->orderBy('slug')->get()->map($forma),
        ]);
    }

    /**
     * I byte di una foto del catalogo.
     *
     * Stanno in `storage/app/private/catalog/` e NON sotto
     * `images/{utente}/`: una foto di catalogo e' comune a tutti gli
     * iscritti, e il percorso per utente la renderebbe di uno solo - il primo
     * che l'ha caricata - lasciando gli altri con un rettangolo vuoto.
     *
     * Resta fuori da `public/` come le foto dei progressi: sotto
     * `auth:sanctum` come tutto il resto di questa API. Il catalogo e' di
     * tutti gli iscritti, non del mondo.
     *
     * Il regex sul nome e' lo stesso di `ImageController`, e per lo stesso
     * motivo: il nome finisce in un percorso su disco, e il primo carattere
     * che non puo' essere un punto esclude `.` e `..` insieme.
     */
    public function image(string $name): StreamedResponse
    {
        abort_unless(preg_match('/^[A-Za-z0-9_-][A-Za-z0-9._-]{0,119}$/', $name) === 1, 404);

        $percorso = "catalog/{$name}";
        abort_unless(Storage::disk('local')->exists($percorso), 404);

        return Storage::disk('local')->response($percorso);
    }
```

- [ ] **Step 4: Registra le due rotte**

In `backend/routes/api.php`, accanto alle due del Task 8:

```php
    Route::get('catalog/taxonomies', [CatalogController::class, 'taxonomies']);
    Route::get('catalog/images/{name}', [CatalogController::class, 'image']);
```

- [ ] **Step 5: Lancia i test e verifica che passino**

```bash
cd backend && php artisan test --filter=CatalogPullTest
```

Atteso: PASS, 11 test.

- [ ] **Step 6: Commit**

```bash
cd backend && git add app/Http/Controllers/Api/CatalogController.php routes/api.php tests/Feature/CatalogPullTest.php
git commit -m "feat(catalogo): tassonomie e foto comuni per l'app"
```

---

### Task 10: Il middleware `EnsureAdmin`

**Files:**
- Create: `backend/app/Http/Middleware/EnsureAdmin.php`
- Modify: `backend/bootstrap/app.php`
- Modify: `backend/app/Http/Controllers/Api/AdminController.php`
- Modify: `backend/routes/api.php`
- Test: `backend/tests/Feature/AdminTest.php`

**Interfaces:**
- Produces: alias di middleware `admin`, registrato in `bootstrap/app.php`, che risponde 403 a chi non ha `is_admin`. `AdminController::ensureAdmin()` sparisce e le sue due rotte passano dal gruppo.

- [ ] **Step 1: Scrivi il test che fallisce**

In `backend/tests/Feature/AdminTest.php`, aggiungi:

```php
    public function test_il_gruppo_admin_e_chiuso_a_chi_non_lo_e(): void
    {
        $anna = \App\Models\User::factory()->create(['is_admin' => false]);

        // Ogni rotta del gruppo, una per una: un controllo scritto a mano in
        // ogni metodo e' un controllo che prima o poi si dimentica in uno, ed
        // e' esattamente il motivo per cui e' diventato un middleware.
        foreach (['/api/admin/users'] as $rotta) {
            $this->actingAs($anna)->getJson($rotta)->assertForbidden();
        }
    }

    public function test_il_gruppo_admin_e_chiuso_a_chi_non_ha_un_account(): void
    {
        $this->getJson('/api/admin/users')->assertUnauthorized();
    }
```

- [ ] **Step 2: Lancia il test e verifica che passi gia'**

```bash
cd backend && php artisan test --filter=AdminTest
```

Atteso: PASS. Il controllo esiste gia' dentro `AdminController::ensureAdmin`, e questi test lo confermano. Servono adesso perche' il passo successivo lo sposta: sono la rete che dice che spostandolo non e' caduto.

- [ ] **Step 3: Scrivi il middleware**

Crea `backend/app/Http/Middleware/EnsureAdmin.php`:

```php
<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Solo per chi ha `is_admin`.
 *
 * Stava dentro `AdminController::ensureAdmin()`, chiamato a mano in ognuno
 * dei suoi due metodi, e li' andava bene: due metodi si controllano a vista.
 * Il gestionale ne porta una ventina, e un controllo ripetuto venti volte e'
 * un controllo che prima o poi si dimentica in uno - senza che niente lo
 * dica, perche' la rotta funzionerebbe benissimo.
 *
 * Il 403 e non un 404: chi non e' amministratore sa gia' che esiste
 * un'amministrazione, l'app gliene nasconde solo la voce di menu. Nascondere
 * l'esistenza della rotta non protegge nessuno e rende illeggibile un errore
 * di configurazione.
 */
class EnsureAdmin
{
    public function handle(Request $request, Closure $next): Response
    {
        abort_unless($request->user()?->is_admin, 403, 'Non autorizzato.');

        return $next($request);
    }
}
```

- [ ] **Step 4: Registra l'alias**

In `backend/bootstrap/app.php`, dentro `withMiddleware`, dopo la riga `$middleware->api(append: [SetLocaleFromHeader::class]);` aggiungi:

```php
        $middleware->alias(['admin' => EnsureAdmin::class]);
```

E in cima al file, agli import:

```php
use App\Http\Middleware\EnsureAdmin;
```

- [ ] **Step 5: Sposta le rotte dentro un gruppo**

In `backend/routes/api.php`, sostituisci il blocco delle due rotte admin con:

```php
    /*
     * Amministrazione.
     *
     * Il controllo su `is_admin` sta nel middleware e non piu' dentro il
     * controller: le rotte del gestionale sono una ventina, e un controllo
     * ripetuto in ogni metodo e' un controllo che prima o poi manca in uno.
     */
    Route::middleware('admin')->prefix('admin')->group(function () {
        Route::get('users', [AdminController::class, 'users']);

        /*
         * Limitato per tentativi come `login` e `register`.
         *
         * Il middleware basta a fermare chi non e' amministratore, ma questo
         * endpoint assegna password: un limite lo rende anche inutile da
         * usare a raffica, e un amministratore legittimo non ne cambia dieci
         * al minuto.
         */
        Route::post('users/{user}/password', [AdminController::class, 'resetPassword'])
            ->middleware('throttle:10,1');
    });
```

- [ ] **Step 6: Togli il controllo a mano dal controller**

In `backend/app/Http/Controllers/Api/AdminController.php`: cancella il metodo privato `ensureAdmin()` e le due righe `$this->ensureAdmin($request);` dai due metodi. Aggiorna il commento di classe: la frase "IL CONTROLLO STA QUI, non nella schermata" resta vera nella sostanza (il server e non l'app), ma va detto dove sta adesso.

```php
/**
 * Rimettere a posto la password di qualcuno, dall'app o dal gestionale.
 *
 * Serve perche' non c'e' il recupero password via email: senza questo,
 * chi dimentica la propria e' fuori, e l'unico rimedio era un comando sul
 * server. Con pochi utenti che si conoscono, e' il rimedio proporzionato.
 *
 * IL CONTROLLO STA SUL SERVER, non nella schermata: l'app nasconde la voce a
 * chi non e' amministratore, ma nascondere non e' proteggere. Vive nel
 * middleware `admin` sul gruppo di rotte, non piu' in questi metodi - vedi
 * `EnsureAdmin`.
 */
```

- [ ] **Step 7: Lancia l'intera suite**

```bash
cd backend && php artisan test
```

Atteso: PASS. In particolare i due test del passo 1 devono ancora passare: e' la prova che spostando il controllo non e' caduto.

- [ ] **Step 8: Commit**

```bash
cd backend && git add app/Http/Middleware/EnsureAdmin.php bootstrap/app.php app/Http/Controllers/Api/AdminController.php routes/api.php tests/Feature/AdminTest.php
git commit -m "refactor(admin): il controllo su is_admin diventa un middleware"
```

---

### Task 11: Le proposte in revisione

**Files:**
- Create: `backend/app/Http/Controllers/Api/Admin/SubmissionController.php`
- Create: `backend/app/Http/Requests/Admin/ReviewSubmissionRequest.php`
- Modify: `backend/routes/api.php`
- Test: `backend/tests/Feature/Admin/SubmissionTest.php`

**Interfaces:**
- Consumes: `status`, `reviewed_*` dai Task 1 e 2; il middleware `admin` dal Task 10.
- Produces:
  - `GET /api/admin/submissions?type=exercise|food&status=pending&q=` → `{ "data": [{ id, type, uid, name, author: {handle, displayName}, createdAt, fields: {...} }] }`
  - `POST /api/admin/submissions/{type}/{id}/approve` con corpo opzionale = i campi corretti → `{ "data": {...} }`
  - `POST /api/admin/submissions/{type}/{id}/reject` con corpo `{ note?: string }` → `{ "ok": true }`
  - `type` e' `exercise` o `food`; qualunque altro valore da' 404.

- [ ] **Step 1: Scrivi il test che fallisce**

Crea `backend/tests/Feature/Admin/SubmissionTest.php`:

```php
<?php

namespace Tests\Feature\Admin;

use App\Models\Exercise;
use App\Models\Food;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SubmissionTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    private User $anna;

    protected function setUp(): void
    {
        parent::setUp();
        $this->admin = User::factory()->create(['is_admin' => true, 'handle' => 'martin']);
        $this->anna = User::factory()->create(['handle' => 'anna', 'display_name' => 'Anna']);
    }

    private function proposta(string $nome = 'Pasta della Lidl'): Food
    {
        return Food::create([
            'uid' => 'p-1',
            'name' => $nome,
            'name_norm' => \App\Support\Text::normalize($nome),
            'kcal' => 353,
            'status' => 'pending',
            'created_by' => $this->anna->id,
        ]);
    }

    public function test_l_elenco_dice_chi_ha_proposto(): void
    {
        $this->proposta();

        /*
         * `created_by` non esce da nessuna risposta verso un utente normale,
         * ed e' scritto nella migrazione della tabella. Qui esce, e la
         * differenza e' il motivo: in revisione bisogna sapere chi propone
         * cosa, se non altro per riconoscere chi propone spazzatura. Il
         * catalogo continua a non dirlo a nessun altro.
         */
        $this->actingAs($this->admin)
            ->getJson('/api/admin/submissions?type=food')
            ->assertOk()
            ->assertJsonPath('data.0.author.handle', 'anna')
            ->assertJsonPath('data.0.name', 'Pasta della Lidl');
    }

    public function test_l_elenco_mostra_solo_le_proposte(): void
    {
        $this->proposta();
        Food::create([
            'uid' => 'p-2',
            'name' => 'Riso',
            'name_norm' => 'riso',
            'kcal' => 330,
            'status' => 'published',
        ]);

        $this->actingAs($this->admin)
            ->getJson('/api/admin/submissions?type=food')
            ->assertOk()
            ->assertJsonCount(1, 'data');
    }

    public function test_approvare_pubblica_e_registra_chi_ha_deciso(): void
    {
        $voce = $this->proposta();

        $this->actingAs($this->admin)
            ->postJson("/api/admin/submissions/food/{$voce->id}/approve")
            ->assertOk();

        $voce->refresh();
        $this->assertSame('published', $voce->status);
        $this->assertSame($this->admin->id, $voce->reviewed_by);
        $this->assertNotNull($voce->reviewed_at);
    }

    public function test_si_corregge_mentre_si_approva(): void
    {
        $voce = $this->proposta();

        /*
         * Una correzione e un'approvazione sono la stessa richiesta e non
         * due: in revisione si guarda e si corregge nello stesso gesto, e due
         * chiamate separate possono divergere - la seconda fallisce e la
         * prima e' gia' passata.
         */
        $this->actingAs($this->admin)
            ->postJson("/api/admin/submissions/food/{$voce->id}/approve", [
                'name' => 'Pasta di semola Lidl',
                'brand' => 'Lidl',
                'kcal' => 350,
            ])
            ->assertOk();

        $voce->refresh();
        $this->assertSame('Pasta di semola Lidl', $voce->name);
        $this->assertSame('pasta di semola lidl', $voce->name_norm);
        $this->assertSame('Lidl', $voce->brand);
        $this->assertEqualsWithDelta(350.0, $voce->kcal, 0.01);
        $this->assertSame('published', $voce->status);
    }

    public function test_rifiutare_non_toglie_niente_a_nessuno(): void
    {
        $voce = $this->proposta();

        $this->actingAs($this->admin)
            ->postJson("/api/admin/submissions/food/{$voce->id}/reject", [
                'note' => 'I valori non corrispondono all\'etichetta.',
            ])
            ->assertOk();

        $voce->refresh();
        $this->assertSame('rejected', $voce->status);
        $this->assertSame('I valori non corrispondono all\'etichetta.', $voce->review_note);
        // La riga resta: l'autore ce l'ha sul telefono e li' nessuno gliela
        // tocca. Rifiutare vuol dire "non entra nel catalogo", non "sparisce".
        $this->assertNotNull(Food::find($voce->id));
    }

    public function test_una_voce_rifiutata_non_esce_dal_catalogo(): void
    {
        $voce = $this->proposta();
        $this->actingAs($this->admin)
            ->postJson("/api/admin/submissions/food/{$voce->id}/reject")
            ->assertOk();

        $this->actingAs($this->anna)
            ->getJson('/api/catalog/foods')
            ->assertOk()
            ->assertJsonCount(0, 'data');
    }

    public function test_approvare_su_un_nome_gia_in_catalogo_fallisce_leggibilmente(): void
    {
        Food::create([
            'uid' => 'esistente',
            'name' => 'Pasta della Lidl',
            'name_norm' => 'pasta della lidl',
            'kcal' => 353,
            'status' => 'published',
        ]);
        $voce = Food::create([
            'uid' => 'p-9',
            'name' => 'Pasta Della  Lidl',
            'name_norm' => 'pasta della lidl 2',
            'kcal' => 350,
            'status' => 'pending',
            'created_by' => $this->anna->id,
        ]);

        // Senza questo controllo risponderebbe il vincolo unico del database,
        // con un errore che nessuno puo' interpretare a schermo.
        $this->actingAs($this->admin)
            ->postJson("/api/admin/submissions/food/{$voce->id}/approve", [
                'name' => 'Pasta della Lidl',
                'kcal' => 350,
            ])
            ->assertStatus(422)
            ->assertJsonPath('errors.name.0', 'Nome gia\' in catalogo.');
    }

    public function test_un_tipo_sconosciuto_non_esiste(): void
    {
        $this->actingAs($this->admin)
            ->getJson('/api/admin/submissions?type=ricette')
            ->assertNotFound();
    }

    public function test_chi_non_e_amministratore_non_revisiona(): void
    {
        $voce = $this->proposta();

        $this->actingAs($this->anna)
            ->getJson('/api/admin/submissions?type=food')
            ->assertForbidden();

        $this->actingAs($this->anna)
            ->postJson("/api/admin/submissions/food/{$voce->id}/approve")
            ->assertForbidden();
    }
}
```

- [ ] **Step 2: Lancia il test e verifica che fallisca**

```bash
cd backend && php artisan test --filter=SubmissionTest
```

Atteso: FAIL, 404 su `/api/admin/submissions`.

- [ ] **Step 3: Scrivi il FormRequest**

Crea `backend/app/Http/Requests/Admin/ReviewSubmissionRequest.php`:

```php
<?php

namespace App\Http\Requests\Admin;

use Illuminate\Foundation\Http\FormRequest;

/**
 * I campi con cui si approva una proposta.
 *
 * SONO TUTTI OPZIONALI, e non e' lassismo: approvare senza correggere niente
 * e' il caso normale, e obbligare a rimandare indietro l'intera voce
 * significherebbe che una richiesta a cui manca un campo la svuota. Cio' che
 * non arriva resta com'e'.
 *
 * Le rule sono l'unione di quelle degli esercizi e di quelle degli alimenti:
 * il controller applica solo le chiavi pertinenti al tipo, e una chiave di
 * troppo non fa danno perche' `fill()` guarda comunque il fillable del model
 * giusto.
 */
class ReviewSubmissionRequest extends FormRequest
{
    public function authorize(): bool
    {
        // Il middleware `admin` sul gruppo di rotte ha gia' deciso.
        return true;
    }

    public function rules(): array
    {
        return [
            'name' => ['sometimes', 'string', 'max:120'],
            // Esercizi
            'muscleGroup' => ['sometimes', 'string', 'max:40'],
            'secondaryMuscles' => ['sometimes', 'nullable', 'string', 'max:200'],
            'equipment' => ['sometimes', 'nullable', 'string', 'max:120'],
            'instructions' => ['sometimes', 'nullable', 'string', 'max:2000'],
            // Alimenti
            'brand' => ['sometimes', 'nullable', 'string', 'max:60'],
            'barcode' => ['sometimes', 'nullable', 'string', 'max:32'],
            'kcal' => ['sometimes', 'numeric', 'min:0', 'max:9999'],
            'protein' => ['sometimes', 'numeric', 'min:0', 'max:9999'],
            'carbs' => ['sometimes', 'numeric', 'min:0', 'max:9999'],
            'sugars' => ['sometimes', 'numeric', 'min:0', 'max:9999'],
            'fat' => ['sometimes', 'numeric', 'min:0', 'max:9999'],
            'saturatedFat' => ['sometimes', 'numeric', 'min:0', 'max:9999'],
            'fiber' => ['sometimes', 'numeric', 'min:0', 'max:9999'],
            'salt' => ['sometimes', 'numeric', 'min:0', 'max:9999'],
            'isLiquid' => ['sometimes', 'boolean'],
            'defaultServingG' => ['sometimes', 'nullable', 'numeric', 'min:0', 'max:9999'],
            'servingLabel' => ['sometimes', 'nullable', 'string', 'max:40'],
            // Rifiuto
            'note' => ['sometimes', 'nullable', 'string', 'max:500'],
        ];
    }
}
```

- [ ] **Step 4: Scrivi il controller**

Crea `backend/app/Http/Controllers/Api/Admin/SubmissionController.php`:

```php
<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\ReviewSubmissionRequest;
use App\Models\Exercise;
use App\Models\Food;
use App\Models\User;
use App\Support\Text;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

/**
 * La coda di revisione.
 *
 * Cio' che un utente si crea sul telefono resta suo e viene PROPOSTO: entra
 * nel catalogo di tutti quando qualcuno lo decide qui. E' il rovesciamento
 * della regola con cui questo server e' nato - "un esercizio creato a mano
 * entra nell'elenco di chiunque" - e la ragione e' che il catalogo di tutti
 * non puo' essere la somma di quel che ciascuno scrive di getto: manca
 * l'alimento della Lidl, uno se lo aggiunge coi valori che ha letto male, e
 * da li' in poi ce l'hanno tutti.
 *
 * Una coda sola per due tipi, perche' e' un gesto solo: si guardano le
 * proposte, non "le proposte di alimenti" e poi "le proposte di esercizi".
 */
class SubmissionController extends Controller
{
    /** Quante ne mostra una pagina. */
    private const PER_PAGE = 100;

    /**
     * I due tipi che si revisionano.
     *
     * Una mappa e non un `match` sparso: il tipo arriva dalla URL, e un
     * elenco chiuso in un punto solo e' cio' che impedisce a `?type=users` di
     * diventare qualcosa.
     */
    private const TIPI = [
        'exercise' => Exercise::class,
        'food' => Food::class,
    ];

    public function index(Request $request): JsonResponse
    {
        $tipo = (string) $request->query('type', 'exercise');
        $classe = $this->classeDi($tipo);

        $stato = (string) $request->query('status', 'pending');
        abort_unless(in_array($stato, Exercise::STATUSES, true), 404);

        $term = Text::normalize((string) $request->query('q', ''));

        $righe = $classe::query()
            ->where('status', $stato)
            ->when($term !== '', fn ($q) => $q->where('name_norm', 'LIKE', "%{$term}%"))
            // Gli autori in una query sola: con duecento proposte in coda,
            // leggere l'autore riga per riga sono duecento query.
            ->with('author:id,handle,display_name,name')
            ->orderByDesc('created_at')
            ->limit(self::PER_PAGE)
            ->get();

        return response()->json([
            'data' => $righe->map(fn (Model $r) => $this->forma($r, $tipo)),
        ]);
    }

    public function approve(ReviewSubmissionRequest $request, string $type, int $id): JsonResponse
    {
        $riga = $this->trova($type, $id);
        $dati = $request->safe()->all();

        if ($errore = $this->applicaCorrezioni($riga, $dati, $type)) {
            return $errore;
        }

        $riga->fill([
            'status' => 'published',
            'reviewed_at' => Carbon::now(),
            'reviewed_by' => $request->user()->id,
            // Una nota di rifiuto non ha senso su una voce approvata, e
            // lasciarla scritta racconterebbe una storia sbagliata la
            // prossima volta che qualcuno la guarda.
            'review_note' => null,
        ])->save();

        return response()->json(['data' => $this->forma($riga->fresh(), $type)]);
    }

    public function reject(ReviewSubmissionRequest $request, string $type, int $id): JsonResponse
    {
        $riga = $this->trova($type, $id);

        $riga->fill([
            'status' => 'rejected',
            'reviewed_at' => Carbon::now(),
            'reviewed_by' => $request->user()->id,
            'review_note' => $request->safe()->all()['note'] ?? null,
        ])->save();

        /*
         * La riga resta, e non e' una svista.
         *
         * L'autore ce l'ha comunque sul telefono, dove nessuno gliela tocca:
         * rifiutare vuol dire "non entra nel catalogo di tutti", non
         * "sparisce". E la nota serve il giorno in cui gliela si dira' - oggi
         * non c'e' niente che gliela mostri, e la spec lo dichiara.
         */
        return response()->json(['ok' => true]);
    }

    /**
     * Scrive sulla riga i campi corretti in revisione.
     *
     * Torna una risposta di errore, o null se e' andata. Il caso da fermare e'
     * uno solo: correggere il nome addosso a una voce che c'e' gia'. Il
     * vincolo unico su `name_norm` risponderebbe comunque, ma con un errore
     * del database che a schermo non si puo' leggere.
     */
    private function applicaCorrezioni(Model $riga, array $dati, string $type): ?JsonResponse
    {
        if (array_key_exists('name', $dati)) {
            $norm = Text::normalize($dati['name']);

            if ($norm === '') {
                return response()->json([
                    'message' => 'Il nome non puo\' essere vuoto.',
                    'errors' => ['name' => ['Il nome non puo\' essere vuoto.']],
                ], 422);
            }

            $classe = $this->classeDi($type);
            $altra = $classe::query()
                ->where('name_norm', $norm)
                ->whereKeyNot($riga->id)
                ->exists();

            if ($altra) {
                return response()->json([
                    'message' => 'C\'e\' gia\' una voce con questo nome in catalogo.',
                    'errors' => ['name' => ['Nome gia\' in catalogo.']],
                ], 422);
            }

            $riga->name = trim($dati['name']);
            $riga->name_norm = $norm;
        }

        // Mappatura esplicita camelCase -> colonna, come in
        // `ProfileController::update`: un `fill()` cieco accetterebbe
        // qualunque chiave abbia passato la validazione.
        $map = $type === 'exercise'
            ? [
                'muscleGroup' => 'muscle_group',
                'secondaryMuscles' => 'secondary_muscles',
                'equipment' => 'equipment',
                'instructions' => 'instructions',
            ]
            : [
                'brand' => 'brand',
                'barcode' => 'barcode',
                'kcal' => 'kcal',
                'protein' => 'protein',
                'carbs' => 'carbs',
                'sugars' => 'sugars',
                'fat' => 'fat',
                'saturatedFat' => 'saturated_fat',
                'fiber' => 'fiber',
                'salt' => 'salt',
                'isLiquid' => 'is_liquid',
                'defaultServingG' => 'default_serving_g',
                'servingLabel' => 'serving_label',
            ];

        foreach ($map as $input => $colonna) {
            if (array_key_exists($input, $dati)) {
                $riga->{$colonna} = $dati[$input];
            }
        }

        return null;
    }

    /** @return class-string<Model> */
    private function classeDi(string $type): string
    {
        // 404 e non 422: un tipo che non esiste e' una URL che non esiste.
        abort_unless(array_key_exists($type, self::TIPI), 404);

        return self::TIPI[$type];
    }

    private function trova(string $type, int $id): Model
    {
        return $this->classeDi($type)::query()->findOrFail($id);
    }

    /** @return array<string, mixed> */
    private function forma(Model $riga, string $type): array
    {
        $comuni = [
            'id' => $riga->id,
            'type' => $type,
            'uid' => $riga->uid,
            'name' => $riga->name,
            'status' => $riga->status,
            'reviewNote' => $riga->review_note,
            'createdAt' => $riga->created_at?->toIso8601String(),
            'author' => $riga->author === null ? null : [
                'handle' => $riga->author->handle,
                'displayName' => $riga->author->display_name ?? $riga->author->name,
            ],
        ];

        $campi = $type === 'exercise'
            ? [
                'muscleGroup' => $riga->muscle_group,
                'secondaryMuscles' => $riga->secondary_muscles,
                'equipment' => $riga->equipment,
                'instructions' => $riga->instructions,
                'photo' => $riga->photo,
            ]
            : [
                'brand' => $riga->brand,
                'barcode' => $riga->barcode,
                'offId' => $riga->off_id,
                'kcal' => $riga->kcal,
                'protein' => $riga->protein,
                'carbs' => $riga->carbs,
                'sugars' => $riga->sugars,
                'fat' => $riga->fat,
                'saturatedFat' => $riga->saturated_fat,
                'fiber' => $riga->fiber,
                'salt' => $riga->salt,
                'isLiquid' => $riga->is_liquid,
                'defaultServingG' => $riga->default_serving_g,
                'servingLabel' => $riga->serving_label,
                'image' => $riga->image,
            ];

        return [...$comuni, 'fields' => $campi];
    }
}
```

- [ ] **Step 5: Aggiungi la relazione `author` ai due model**

`$riga->author` non esiste ancora. In `backend/app/Models/Exercise.php` e in `backend/app/Models/Food.php`, aggiungi dentro la classe:

```php
    /**
     * Chi ha proposto la voce.
     *
     * ESCE SOLO DALLE ROTTE `/api/admin/*`. Verso un utente normale il
     * catalogo continua a non dire di chi e' una voce, e la migrazione della
     * tabella spiega perche': sapere che un esercizio l'ha inventato Tizio e'
     * un fatto su Tizio, e non serve a nessuno per allenarsi.
     */
    public function author(): \Illuminate\Database\Eloquent\Relations\BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
```

- [ ] **Step 6: Registra le rotte**

In `backend/routes/api.php`, dentro il gruppo `Route::middleware('admin')->prefix('admin')`, aggiungi:

```php
        Route::get('submissions', [SubmissionController::class, 'index']);
        Route::post('submissions/{type}/{id}/approve', [SubmissionController::class, 'approve']);
        Route::post('submissions/{type}/{id}/reject', [SubmissionController::class, 'reject']);
```

E l'import in cima:

```php
use App\Http\Controllers\Api\Admin\SubmissionController;
```

- [ ] **Step 7: Lancia i test e verifica che passino**

```bash
cd backend && php artisan test --filter=SubmissionTest
```

Atteso: PASS, 9 test.

- [ ] **Step 8: Commit**

```bash
cd backend && git add app/Http/Controllers/Api/Admin/SubmissionController.php app/Http/Requests/Admin/ReviewSubmissionRequest.php app/Models/Exercise.php app/Models/Food.php routes/api.php tests/Feature/Admin/SubmissionTest.php
git commit -m "feat(admin): la coda di revisione delle proposte"
```

---

### Task 12: Il CRUD degli esercizi dal gestionale, con la foto

**Files:**
- Create: `backend/app/Http/Controllers/Api/Admin/AdminExerciseController.php`
- Create: `backend/app/Http/Requests/Admin/AdminExerciseRequest.php`
- Create: `backend/app/Support/CatalogPhoto.php`
- Modify: `backend/routes/api.php`
- Test: `backend/tests/Feature/Admin/AdminExerciseTest.php`

**Interfaces:**
- Consumes: il middleware `admin` dal Task 10; `catalog/images/{name}` dal Task 9.
- Produces:
  - `GET /api/admin/exercises?q=&muscleGroup=&equipment=&missing=instructions|photo&page=`
  - `POST /api/admin/exercises`, `PATCH /api/admin/exercises/{id}`, `DELETE /api/admin/exercises/{id}`
  - `POST /api/admin/exercises/{id}/photo` (campo `file`) → `{ "photo": "<uuid>.jpg" }`
  - `App\Support\CatalogPhoto::store(UploadedFile $file): string` che salva in `catalog/` con un nome UUID e torna il nome; `CatalogPhoto::forget(?string $name): void` che cancella il file se c'e'.

- [ ] **Step 1: Scrivi il test che fallisce**

Crea `backend/tests/Feature/Admin/AdminExerciseTest.php`:

```php
<?php

namespace Tests\Feature\Admin;

use App\Models\Exercise;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class AdminExerciseTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->admin = User::factory()->create(['is_admin' => true]);
    }

    private function esercizio(array $attributi = []): Exercise
    {
        return Exercise::create([
            'uid' => 'ex-1',
            'name' => 'Panca piana',
            'name_norm' => 'panca piana',
            'muscle_group' => 'petto',
            'equipment' => 'bilanciere,panca',
            'status' => 'published',
            ...$attributi,
        ]);
    }

    public function test_l_elenco_filtra_per_gruppo_e_attrezzo(): void
    {
        $this->esercizio();
        $this->esercizio(['uid' => 'ex-2', 'name' => 'Squat', 'name_norm' => 'squat', 'muscle_group' => 'quadricipiti', 'equipment' => 'bilanciere']);

        $this->actingAs($this->admin)
            ->getJson('/api/admin/exercises?muscleGroup=petto')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.name', 'Panca piana');

        $this->actingAs($this->admin)
            ->getJson('/api/admin/exercises?equipment=panca')
            ->assertOk()
            ->assertJsonCount(1, 'data');
    }

    public function test_l_elenco_trova_cio_che_manca(): void
    {
        $this->esercizio(['instructions' => 'Come si fa.']);
        $this->esercizio(['uid' => 'ex-2', 'name' => 'Squat', 'name_norm' => 'squat']);

        // E' il numero che la dashboard mostra e il filtro con cui si va a
        // colmarlo: 128 esercizi su 200 erano muti, e non c'era modo di
        // sapere quali.
        $this->actingAs($this->admin)
            ->getJson('/api/admin/exercises?missing=instructions')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.name', 'Squat');
    }

    public function test_l_elenco_comprende_le_proposte(): void
    {
        $this->esercizio(['uid' => 'ex-2', 'name' => 'Squat', 'name_norm' => 'squat', 'status' => 'pending']);

        // Il gestionale vede tutto, e' il suo mestiere: la coda di revisione
        // e' una vista comoda sullo stesso insieme, non un insieme diverso.
        $this->actingAs($this->admin)
            ->getJson('/api/admin/exercises')
            ->assertOk()
            ->assertJsonCount(1, 'data');
    }

    public function test_si_crea_un_esercizio_gia_pubblicato(): void
    {
        $this->actingAs($this->admin)
            ->postJson('/api/admin/exercises', [
                'name' => 'Rematore con bilanciere',
                'muscleGroup' => 'schiena',
                'equipment' => 'bilanciere',
                'instructions' => 'Busto a 45 gradi, il bilanciere sfiora le cosce.',
            ])
            ->assertCreated();

        $voce = Exercise::where('name_norm', 'rematore con bilanciere')->first();
        // Cio' che nasce dal gestionale e' gia' catalogo: chi lo scrive e'
        // la stessa persona che approverebbe.
        $this->assertSame('published', $voce->status);
        $this->assertNotNull($voce->uid);
    }

    public function test_si_corregge_la_descrizione(): void
    {
        $voce = $this->esercizio();

        $this->actingAs($this->admin)
            ->patchJson("/api/admin/exercises/{$voce->id}", [
                'instructions' => 'Scapole addotte per tutta la serie.',
            ])
            ->assertOk();

        $this->assertSame('Scapole addotte per tutta la serie.', $voce->fresh()->instructions);
    }

    public function test_rinominare_addosso_a_un_altro_fallisce_leggibilmente(): void
    {
        $this->esercizio();
        $altro = $this->esercizio(['uid' => 'ex-2', 'name' => 'Squat', 'name_norm' => 'squat']);

        $this->actingAs($this->admin)
            ->patchJson("/api/admin/exercises/{$altro->id}", ['name' => 'Panca piana'])
            ->assertStatus(422)
            ->assertJsonPath('errors.name.0', 'Nome gia\' in catalogo.');
    }

    public function test_l_uid_non_si_tocca_rinominando(): void
    {
        $voce = $this->esercizio();

        $this->actingAs($this->admin)
            ->patchJson("/api/admin/exercises/{$voce->id}", ['name' => 'Panca piana con bilanciere'])
            ->assertOk();

        // E' l'intero motivo per cui `uid` esiste: rinominare deve arrivare
        // sul telefono come una rinomina, non come una voce nuova.
        $this->assertSame('ex-1', $voce->fresh()->uid);
    }

    public function test_cancellare_e_morbido(): void
    {
        $voce = $this->esercizio();

        $this->actingAs($this->admin)
            ->deleteJson("/api/admin/exercises/{$voce->id}")
            ->assertOk();

        $this->assertNull(Exercise::find($voce->id));
        $this->assertNotNull(Exercise::withTrashed()->find($voce->id)->deleted_at);
    }

    public function test_si_carica_una_foto(): void
    {
        Storage::fake('local');
        $voce = $this->esercizio();

        $r = $this->actingAs($this->admin)
            ->post("/api/admin/exercises/{$voce->id}/photo", [
                'file' => UploadedFile::fake()->image('panca.jpg'),
            ])
            ->assertOk();

        $nome = $r->json('photo');
        $this->assertSame($nome, $voce->fresh()->photo);
        Storage::disk('local')->assertExists("catalog/{$nome}");
    }

    public function test_una_foto_nuova_toglie_la_vecchia(): void
    {
        Storage::fake('local');
        $voce = $this->esercizio();

        $primo = $this->actingAs($this->admin)
            ->post("/api/admin/exercises/{$voce->id}/photo", ['file' => UploadedFile::fake()->image('a.jpg')])
            ->json('photo');

        $this->actingAs($this->admin)
            ->post("/api/admin/exercises/{$voce->id}/photo", ['file' => UploadedFile::fake()->image('b.jpg')])
            ->assertOk();

        // Senza, ogni correzione lascerebbe in cartella un file che nessuna
        // riga nomina piu': e' lo stesso difetto che `collectOrphanPhotos`
        // risolve sul telefono, ed e' piu' facile non crearlo.
        Storage::disk('local')->assertMissing("catalog/{$primo}");
    }

    public function test_un_file_che_non_e_un_immagine_non_entra(): void
    {
        Storage::fake('local');
        $voce = $this->esercizio();

        $this->actingAs($this->admin)
            ->post("/api/admin/exercises/{$voce->id}/photo", [
                'file' => UploadedFile::fake()->create('lista.pdf', 10, 'application/pdf'),
            ])
            ->assertStatus(422);
    }

    public function test_chi_non_e_amministratore_non_entra(): void
    {
        $anna = User::factory()->create();
        $voce = $this->esercizio();

        $this->actingAs($anna)->getJson('/api/admin/exercises')->assertForbidden();
        $this->actingAs($anna)->postJson('/api/admin/exercises', [])->assertForbidden();
        $this->actingAs($anna)->patchJson("/api/admin/exercises/{$voce->id}", [])->assertForbidden();
        $this->actingAs($anna)->deleteJson("/api/admin/exercises/{$voce->id}")->assertForbidden();
    }
}
```

- [ ] **Step 2: Lancia il test e verifica che fallisca**

```bash
cd backend && php artisan test --filter=AdminExerciseTest
```

Atteso: FAIL, 404 su `/api/admin/exercises`.

- [ ] **Step 3: Scrivi il servizio delle foto di catalogo**

Crea `backend/app/Support/CatalogPhoto.php`:

```php
<?php

namespace App\Support;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * I file delle foto di catalogo.
 *
 * Stanno in `storage/app/private/catalog/` e NON sotto `images/{utente}/`
 * come le foto dei progressi: una foto di catalogo e' comune a tutti gli
 * iscritti, e il percorso per utente la renderebbe di uno solo. Fuori da
 * `public/` come tutto il resto, perche' si serve da `GET
 * /api/catalog/images/{name}` che sta sotto `auth:sanctum`.
 *
 * IL NOME E' UN UUID, e non il nome del file caricato. E' la stessa regola
 * del telefono: l'identita' di una foto e' il suo nome, quindi due immagini
 * diverse che collidono su un nome diventerebbero la stessa foto per tutti.
 * "panca.jpg" caricata due volte e' esattamente quel caso.
 */
class CatalogPhoto
{
    /** Cinque megabyte, come `ImageController`. */
    public const MAX_KB = 5120;

    public const MIMES = 'jpg,jpeg,png,webp';

    /** Salva il file e torna il nome con cui si richiama. */
    public static function store(UploadedFile $file): string
    {
        $nome = Str::uuid().'.'.$file->getClientOriginalExtension();
        $file->storeAs('catalog', $nome, 'local');

        return $nome;
    }

    /**
     * Toglie un file, se c'e'.
     *
     * Va chiamata quando una riga smette di nominare una foto - sostituzione
     * o cancellazione della voce - o la cartella accumula file che nessuna
     * riga nomina piu'. Sul telefono ci pensa `collectOrphanPhotos`, qui e'
     * piu' semplice non crearli.
     */
    public static function forget(?string $nome): void
    {
        if ($nome === null || $nome === '') {
            return;
        }

        Storage::disk('local')->delete("catalog/{$nome}");
    }
}
```

- [ ] **Step 4: Scrivi il FormRequest**

Crea `backend/app/Http/Requests/Admin/AdminExerciseRequest.php`:

```php
<?php

namespace App\Http\Requests\Admin;

use Illuminate\Foundation\Http\FormRequest;

/**
 * I campi di un esercizio di catalogo, scritti dal gestionale.
 *
 * `required` in creazione, `sometimes` in correzione: da web si corregge un
 * campo alla volta, e obbligare a rimandare l'intera voce a ogni ritocco
 * significherebbe che una richiesta a cui manca un campo lo svuota.
 *
 * `uid` non c'e', ed e' voluto: l'identita' non si scrive a mano. Nasce con
 * la voce e non cambia piu', o una rinomina arriverebbe sul telefono come una
 * voce nuova invece che come una rinomina.
 */
class AdminExerciseRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // Il middleware `admin` ha gia' deciso.
    }

    public function rules(): array
    {
        $obbligatorio = $this->isMethod('POST') ? 'required' : 'sometimes';

        return [
            'name' => [$obbligatorio, 'string', 'max:120'],
            'muscleGroup' => [$obbligatorio, 'string', 'max:40'],
            'secondaryMuscles' => ['sometimes', 'nullable', 'string', 'max:200'],
            'equipment' => ['sometimes', 'nullable', 'string', 'max:120'],
            'instructions' => ['sometimes', 'nullable', 'string', 'max:2000'],
        ];
    }
}
```

- [ ] **Step 5: Scrivi il controller**

Crea `backend/app/Http/Controllers/Api/Admin/AdminExerciseController.php`:

```php
<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\AdminExerciseRequest;
use App\Models\Exercise;
use App\Support\CatalogPhoto;
use App\Support\Text;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

/**
 * Il catalogo degli esercizi, dal gestionale.
 *
 * Distinto da `ExerciseController`, che serve l'app: quello espone `mine` e
 * nasconde l'autore, questo espone l'autore e non ha bisogno di `mine`. Due
 * pubblici diversi, due forme diverse, e tenerli separati e' cio' che
 * impedisce a un campo pensato per l'amministratore di uscire verso tutti.
 *
 * Qui non c'e' il vincolo "solo le proprie": chi amministra corregge
 * qualunque voce, ed e' il punto del gestionale.
 */
class AdminExerciseController extends Controller
{
    private const PER_PAGE = 50;

    public function index(Request $request): JsonResponse
    {
        $term = Text::normalize((string) $request->query('q', ''));
        $gruppo = (string) $request->query('muscleGroup', '');
        $attrezzo = (string) $request->query('equipment', '');
        $manca = (string) $request->query('missing', '');

        $pagina = Exercise::query()
            ->when($term !== '', fn ($q) => $q->where('name_norm', 'LIKE', "%{$term}%"))
            ->when($gruppo !== '', fn ($q) => $q->where('muscle_group', $gruppo))
            /*
             * `equipment` e' un elenco separato da virgole in colonna, quindi
             * il filtro e' un LIKE. Con le virgole intorno, o "panca"
             * troverebbe anche un ipotetico "panca-piana".
             */
            ->when($attrezzo !== '', fn ($q) => $q->whereRaw(
                "',' || equipment || ',' LIKE ?",
                ["%,{$attrezzo},%"],
            ))
            /*
             * Il filtro con cui si va a colmare cio' che manca. E' l'altra
             * meta' dei due numeri della dashboard: sapere che 128 esercizi
             * sono muti non serve a niente se poi non si sa quali.
             */
            ->when($manca === 'instructions', fn ($q) => $q->where(
                fn ($q2) => $q2->whereNull('instructions')->orWhere('instructions', ''),
            ))
            ->when($manca === 'photo', fn ($q) => $q->whereNull('photo'))
            ->orderBy('name_norm')
            ->paginate(self::PER_PAGE);

        return response()->json([
            'data' => collect($pagina->items())->map(fn (Exercise $e) => $this->forma($e)),
            'meta' => [
                'total' => $pagina->total(),
                'page' => $pagina->currentPage(),
                'lastPage' => $pagina->lastPage(),
            ],
        ]);
    }

    public function store(AdminExerciseRequest $request): JsonResponse
    {
        $dati = $request->safe()->all();
        $norm = Text::normalize($dati['name']);

        if ($errore = $this->nomeLibero($norm, null)) {
            return $errore;
        }

        $esercizio = Exercise::create([
            // L'identita' nasce qui e non cambiera' mai piu'.
            'uid' => (string) Str::uuid(),
            'name' => trim($dati['name']),
            'name_norm' => $norm,
            'muscle_group' => $dati['muscleGroup'],
            'secondary_muscles' => $dati['secondaryMuscles'] ?? null,
            'equipment' => $dati['equipment'] ?? null,
            'instructions' => $dati['instructions'] ?? null,
            /*
             * Gia' pubblicato: chi scrive dal gestionale e' la stessa persona
             * che approverebbe, e farlo passare da `pending` vorrebbe dire
             * approvare le proprie voci.
             */
            'status' => 'published',
            'created_by' => null,
        ]);

        return response()->json(['data' => $this->forma($esercizio)], 201);
    }

    public function update(AdminExerciseRequest $request, Exercise $exercise): JsonResponse
    {
        $dati = $request->safe()->all();

        if (array_key_exists('name', $dati)) {
            $norm = Text::normalize($dati['name']);

            if ($errore = $this->nomeLibero($norm, $exercise->id)) {
                return $errore;
            }

            $exercise->name = trim($dati['name']);
            $exercise->name_norm = $norm;
        }

        $map = [
            'muscleGroup' => 'muscle_group',
            'secondaryMuscles' => 'secondary_muscles',
            'equipment' => 'equipment',
            'instructions' => 'instructions',
        ];
        foreach ($map as $input => $colonna) {
            if (array_key_exists($input, $dati)) {
                $exercise->{$colonna} = $dati[$input];
            }
        }

        $exercise->save();

        return response()->json(['data' => $this->forma($exercise->fresh())]);
    }

    public function destroy(Exercise $exercise): JsonResponse
    {
        /*
         * Cancellazione morbida, e la foto resta.
         *
         * `deleted_at` e' quel che permette al pull di dire ai telefoni che
         * la voce e' stata tolta; una cancellazione vera non avrebbe modo di
         * raccontarsi. E finche' la riga si puo' ripescare, buttarne il file
         * vorrebbe dire ripescarla senza immagine.
         */
        $exercise->delete();

        return response()->json(['ok' => true]);
    }

    public function photo(Request $request, Exercise $exercise): JsonResponse
    {
        $request->validate([
            'file' => ['required', 'file', 'mimes:'.CatalogPhoto::MIMES, 'max:'.CatalogPhoto::MAX_KB],
        ]);

        $vecchia = $exercise->photo;
        $exercise->photo = CatalogPhoto::store($request->file('file'));
        $exercise->save();

        // Dopo il salvataggio: se la scrittura fallisse, la riga
        // continuerebbe a nominare un file che abbiamo appena buttato.
        CatalogPhoto::forget($vecchia);

        return response()->json(['photo' => $exercise->photo]);
    }

    /** Il nome e' libero? Torna la risposta di errore, o null. */
    private function nomeLibero(string $norm, ?int $escluso): ?JsonResponse
    {
        if ($norm === '') {
            return response()->json([
                'message' => 'Il nome dell\'esercizio non puo\' essere vuoto.',
                'errors' => ['name' => ['Il nome non puo\' essere vuoto.']],
            ], 422);
        }

        // Anche fra i cancellati: `name_norm` e' unico sull'intera tabella, e
        // senza `withTrashed` risponderebbe il database con un errore che a
        // schermo non si legge.
        $occupato = Exercise::withTrashed()
            ->where('name_norm', $norm)
            ->when($escluso !== null, fn ($q) => $q->whereKeyNot($escluso))
            ->exists();

        if ($occupato) {
            return response()->json([
                'message' => 'C\'e\' gia\' un esercizio con questo nome.',
                'errors' => ['name' => ['Nome gia\' in catalogo.']],
            ], 422);
        }

        return null;
    }

    /** @return array<string, mixed> */
    private function forma(Exercise $e): array
    {
        return [
            'id' => $e->id,
            'uid' => $e->uid,
            'name' => $e->name,
            'muscleGroup' => $e->muscle_group,
            'secondaryMuscles' => $e->secondary_muscles,
            'equipment' => $e->equipment,
            'instructions' => $e->instructions,
            'photo' => $e->photo,
            'status' => $e->status,
            'createdAt' => $e->created_at?->toIso8601String(),
            'updatedAt' => $e->updated_at?->toIso8601String(),
        ];
    }
}
```

- [ ] **Step 6: Registra le rotte**

In `backend/routes/api.php`, dentro il gruppo `admin`:

```php
        Route::post('exercises/{exercise}/photo', [AdminExerciseController::class, 'photo']);
        Route::get('exercises', [AdminExerciseController::class, 'index']);
        Route::post('exercises', [AdminExerciseController::class, 'store']);
        Route::patch('exercises/{exercise}', [AdminExerciseController::class, 'update']);
        Route::delete('exercises/{exercise}', [AdminExerciseController::class, 'destroy']);
```

La rotta della foto sta **prima** delle altre: registrata dopo, `exercises/{exercise}` la intercetterebbe.

Import in cima: `use App\Http\Controllers\Api\Admin\AdminExerciseController;`

- [ ] **Step 7: Lancia i test e verifica che passino**

```bash
cd backend && php artisan test --filter=AdminExerciseTest
```

Atteso: PASS, 12 test.

- [ ] **Step 8: Commit**

```bash
cd backend && git add app/Http/Controllers/Api/Admin/AdminExerciseController.php app/Http/Requests/Admin/AdminExerciseRequest.php app/Support/CatalogPhoto.php routes/api.php tests/Feature/Admin/AdminExerciseTest.php
git commit -m "feat(admin): catalogo esercizi con descrizioni e foto"
```

---

### Task 13: Il CRUD degli alimenti dal gestionale

**Files:**
- Create: `backend/app/Http/Controllers/Api/Admin/AdminFoodController.php`
- Create: `backend/app/Http/Requests/Admin/AdminFoodRequest.php`
- Modify: `backend/routes/api.php`
- Test: `backend/tests/Feature/Admin/AdminFoodTest.php`

**Interfaces:**
- Consumes: `App\Support\CatalogPhoto` dal Task 12; il middleware `admin` dal Task 10.
- Produces: `GET /api/admin/foods?q=&barcode=&page=`, `POST /api/admin/foods`, `PATCH /api/admin/foods/{id}`, `DELETE /api/admin/foods/{id}`, `POST /api/admin/foods/{id}/image` (campo `file`) → `{ "image": "<uuid>.jpg" }`.

- [ ] **Step 1: Scrivi il test che fallisce**

Crea `backend/tests/Feature/Admin/AdminFoodTest.php`:

```php
<?php

namespace Tests\Feature\Admin;

use App\Models\Food;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class AdminFoodTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->admin = User::factory()->create(['is_admin' => true]);
    }

    private function alimento(array $attributi = []): Food
    {
        return Food::create([
            'uid' => 'f-1',
            'name' => 'Pasta di semola cruda',
            'name_norm' => 'pasta di semola cruda',
            'kcal' => 353,
            'protein' => 10.9,
            'carbs' => 71.2,
            'fat' => 1.4,
            'status' => 'published',
            ...$attributi,
        ]);
    }

    public function test_si_crea_un_alimento_completo(): void
    {
        $this->actingAs($this->admin)
            ->postJson('/api/admin/foods', [
                'name' => 'Yogurt greco 0%',
                'brand' => 'Fage',
                'barcode' => '5201054000000',
                'kcal' => 57,
                'protein' => 10.3,
                'carbs' => 3.6,
                'sugars' => 3.6,
                'fat' => 0.0,
                'saturatedFat' => 0.0,
                'fiber' => 0.0,
                'salt' => 0.1,
                'isLiquid' => false,
                'defaultServingG' => 170,
                'servingLabel' => '1 vasetto = 170 g',
            ])
            ->assertCreated();

        $voce = Food::where('name_norm', 'yogurt greco 0')->first();
        $this->assertNotNull($voce);
        $this->assertSame('published', $voce->status);
        $this->assertSame('5201054000000', $voce->barcode);
        $this->assertEqualsWithDelta(170.0, $voce->default_serving_g, 0.01);
    }

    public function test_si_cerca_per_codice_a_barre(): void
    {
        $this->alimento(['uid' => 'f-2', 'name' => 'Pasta Lidl', 'name_norm' => 'pasta lidl', 'barcode' => '4056489012345']);

        // E' l'identita' esatta di un prodotto: due voci con lo stesso codice
        // sono lo stesso prodotto, ed e' cosi' che si trova il doppione che
        // il nome da solo non farebbe vedere.
        $this->actingAs($this->admin)
            ->getJson('/api/admin/foods?barcode=4056489012345')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.name', 'Pasta Lidl');
    }

    public function test_si_correggono_i_valori(): void
    {
        $voce = $this->alimento();

        $this->actingAs($this->admin)
            ->patchJson("/api/admin/foods/{$voce->id}", ['kcal' => 350, 'salt' => 0.02])
            ->assertOk();

        $voce->refresh();
        $this->assertEqualsWithDelta(350.0, $voce->kcal, 0.01);
        $this->assertEqualsWithDelta(0.02, $voce->salt, 0.001);
        // Cio' che non e' arrivato non si azzera: da web si corregge un campo
        // alla volta, e una PATCH parziale che svuota il resto sarebbe un
        // modo silenzioso di rovinare una voce.
        $this->assertEqualsWithDelta(10.9, $voce->protein, 0.01);
    }

    public function test_rinominare_addosso_a_un_altro_fallisce_leggibilmente(): void
    {
        $this->alimento();
        $altro = $this->alimento(['uid' => 'f-2', 'name' => 'Riso', 'name_norm' => 'riso']);

        $this->actingAs($this->admin)
            ->patchJson("/api/admin/foods/{$altro->id}", ['name' => 'Pasta di semola cruda'])
            ->assertStatus(422)
            ->assertJsonPath('errors.name.0', 'Nome gia\' in catalogo.');
    }

    public function test_cancellare_e_morbido(): void
    {
        $voce = $this->alimento();

        $this->actingAs($this->admin)
            ->deleteJson("/api/admin/foods/{$voce->id}")
            ->assertOk();

        $this->assertNull(Food::find($voce->id));
        $this->assertNotNull(Food::withTrashed()->find($voce->id)->deleted_at);
    }

    public function test_si_carica_un_immagine(): void
    {
        Storage::fake('local');
        $voce = $this->alimento();

        $r = $this->actingAs($this->admin)
            ->post("/api/admin/foods/{$voce->id}/image", [
                'file' => UploadedFile::fake()->image('pasta.jpg'),
            ])
            ->assertOk();

        $nome = $r->json('image');
        $this->assertSame($nome, $voce->fresh()->image);
        Storage::disk('local')->assertExists("catalog/{$nome}");
    }

    public function test_i_valori_negativi_non_entrano(): void
    {
        $voce = $this->alimento();

        $this->actingAs($this->admin)
            ->patchJson("/api/admin/foods/{$voce->id}", ['kcal' => -10])
            ->assertStatus(422);
    }

    public function test_chi_non_e_amministratore_non_entra(): void
    {
        $anna = User::factory()->create();
        $voce = $this->alimento();

        $this->actingAs($anna)->getJson('/api/admin/foods')->assertForbidden();
        $this->actingAs($anna)->patchJson("/api/admin/foods/{$voce->id}", [])->assertForbidden();
    }
}
```

- [ ] **Step 2: Lancia il test e verifica che fallisca**

```bash
cd backend && php artisan test --filter=AdminFoodTest
```

Atteso: FAIL, 404 su `/api/admin/foods`.

- [ ] **Step 3: Scrivi il FormRequest**

Crea `backend/app/Http/Requests/Admin/AdminFoodRequest.php`:

```php
<?php

namespace App\Http\Requests\Admin;

use Illuminate\Foundation\Http\FormRequest;

/**
 * I campi di un alimento di catalogo, scritti dal gestionale.
 *
 * I valori sono PER 100 g o 100 ml, come nella tabella del telefono: la
 * migrazione lo dichiara, e cambiare unita' fra i due lati vorrebbe dire un
 * fattore di conversione da ricordare a ogni lettura - il genere di dettaglio
 * che si dimentica una volta e sballa un diario intero.
 *
 * Il tetto a 9999 non e' arbitrario: nessun alimento ha piu' di 900 kcal per
 * cento grammi, e un numero fuori scala e' un errore di battitura che e'
 * meglio fermare qui che spiegare dopo.
 */
class AdminFoodRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // Il middleware `admin` ha gia' deciso.
    }

    public function rules(): array
    {
        $obbligatorio = $this->isMethod('POST') ? 'required' : 'sometimes';
        $nutriente = ['sometimes', 'numeric', 'min:0', 'max:9999'];

        return [
            'name' => [$obbligatorio, 'string', 'max:120'],
            'brand' => ['sometimes', 'nullable', 'string', 'max:60'],
            'barcode' => ['sometimes', 'nullable', 'string', 'max:32'],
            'offId' => ['sometimes', 'nullable', 'string', 'max:64'],
            'kcal' => $nutriente,
            'protein' => $nutriente,
            'carbs' => $nutriente,
            'sugars' => $nutriente,
            'fat' => $nutriente,
            'saturatedFat' => $nutriente,
            'fiber' => $nutriente,
            'salt' => $nutriente,
            'isLiquid' => ['sometimes', 'boolean'],
            'defaultServingG' => ['sometimes', 'nullable', 'numeric', 'min:0', 'max:9999'],
            'servingLabel' => ['sometimes', 'nullable', 'string', 'max:40'],
        ];
    }
}
```

- [ ] **Step 4: Scrivi il controller**

Crea `backend/app/Http/Controllers/Api/Admin/AdminFoodController.php`:

```php
<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\AdminFoodRequest;
use App\Models\Food;
use App\Support\CatalogPhoto;
use App\Support\Text;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

/**
 * Il catalogo degli alimenti, dal gestionale.
 *
 * Distinto da `FoodController`, che serve l'app, per la stessa ragione per
 * cui `AdminExerciseController` e' distinto dal suo: due pubblici, due forme,
 * e nessun campo pensato per l'amministratore che possa uscire verso tutti.
 */
class AdminFoodController extends Controller
{
    private const PER_PAGE = 50;

    /** camelCase in ingresso, colonna in uscita. Un posto solo. */
    private const CAMPI = [
        'brand' => 'brand',
        'barcode' => 'barcode',
        'offId' => 'off_id',
        'kcal' => 'kcal',
        'protein' => 'protein',
        'carbs' => 'carbs',
        'sugars' => 'sugars',
        'fat' => 'fat',
        'saturatedFat' => 'saturated_fat',
        'fiber' => 'fiber',
        'salt' => 'salt',
        'isLiquid' => 'is_liquid',
        'defaultServingG' => 'default_serving_g',
        'servingLabel' => 'serving_label',
    ];

    public function index(Request $request): JsonResponse
    {
        $term = Text::normalize((string) $request->query('q', ''));
        $barcode = trim((string) $request->query('barcode', ''));

        $pagina = Food::query()
            ->when($term !== '', fn ($q) => $q->where('name_norm', 'LIKE', "%{$term}%"))
            ->when($barcode !== '', fn ($q) => $q->where('barcode', $barcode))
            ->orderBy('name_norm')
            ->paginate(self::PER_PAGE);

        return response()->json([
            'data' => collect($pagina->items())->map(fn (Food $f) => $this->forma($f)),
            'meta' => [
                'total' => $pagina->total(),
                'page' => $pagina->currentPage(),
                'lastPage' => $pagina->lastPage(),
            ],
        ]);
    }

    public function store(AdminFoodRequest $request): JsonResponse
    {
        $dati = $request->safe()->all();
        $norm = Text::normalize($dati['name']);

        if ($errore = $this->nomeLibero($norm, null)) {
            return $errore;
        }

        $food = new Food([
            'uid' => (string) Str::uuid(),
            'name' => trim($dati['name']),
            'name_norm' => $norm,
            'status' => 'published',
            'created_by' => null,
        ]);

        foreach (self::CAMPI as $input => $colonna) {
            if (array_key_exists($input, $dati)) {
                $food->{$colonna} = $dati[$input];
            }
        }

        $food->save();

        return response()->json(['data' => $this->forma($food)], 201);
    }

    public function update(AdminFoodRequest $request, Food $food): JsonResponse
    {
        $dati = $request->safe()->all();

        if (array_key_exists('name', $dati)) {
            $norm = Text::normalize($dati['name']);

            if ($errore = $this->nomeLibero($norm, $food->id)) {
                return $errore;
            }

            $food->name = trim($dati['name']);
            $food->name_norm = $norm;
        }

        /*
         * Solo cio' che e' arrivato.
         *
         * Da web si corregge un campo alla volta, e una PATCH parziale che
         * azzerasse il resto sarebbe un modo silenzioso di rovinare una voce:
         * si corregge il sale e si perdono le proteine.
         */
        foreach (self::CAMPI as $input => $colonna) {
            if (array_key_exists($input, $dati)) {
                $food->{$colonna} = $dati[$input];
            }
        }

        $food->save();

        return response()->json(['data' => $this->forma($food->fresh())]);
    }

    public function destroy(Food $food): JsonResponse
    {
        // Morbida, come per gli esercizi: `deleted_at` e' cio' che permette
        // al pull di dire ai telefoni che la voce e' stata tolta.
        $food->delete();

        return response()->json(['ok' => true]);
    }

    public function image(Request $request, Food $food): JsonResponse
    {
        $request->validate([
            'file' => ['required', 'file', 'mimes:'.CatalogPhoto::MIMES, 'max:'.CatalogPhoto::MAX_KB],
        ]);

        $vecchia = $food->image;
        $food->image = CatalogPhoto::store($request->file('file'));
        $food->save();

        CatalogPhoto::forget($vecchia);

        return response()->json(['image' => $food->image]);
    }

    private function nomeLibero(string $norm, ?int $escluso): ?JsonResponse
    {
        if ($norm === '') {
            return response()->json([
                'message' => 'Il nome dell\'alimento non puo\' essere vuoto.',
                'errors' => ['name' => ['Il nome non puo\' essere vuoto.']],
            ], 422);
        }

        $occupato = Food::withTrashed()
            ->where('name_norm', $norm)
            ->when($escluso !== null, fn ($q) => $q->whereKeyNot($escluso))
            ->exists();

        if ($occupato) {
            return response()->json([
                'message' => 'C\'e\' gia\' un alimento con questo nome.',
                'errors' => ['name' => ['Nome gia\' in catalogo.']],
            ], 422);
        }

        return null;
    }

    /** @return array<string, mixed> */
    private function forma(Food $f): array
    {
        return [
            'id' => $f->id,
            'uid' => $f->uid,
            'name' => $f->name,
            'brand' => $f->brand,
            'barcode' => $f->barcode,
            'offId' => $f->off_id,
            'kcal' => $f->kcal,
            'protein' => $f->protein,
            'carbs' => $f->carbs,
            'sugars' => $f->sugars,
            'fat' => $f->fat,
            'saturatedFat' => $f->saturated_fat,
            'fiber' => $f->fiber,
            'salt' => $f->salt,
            'isLiquid' => $f->is_liquid,
            'defaultServingG' => $f->default_serving_g,
            'servingLabel' => $f->serving_label,
            'image' => $f->image,
            'status' => $f->status,
            'createdAt' => $f->created_at?->toIso8601String(),
            'updatedAt' => $f->updated_at?->toIso8601String(),
        ];
    }
}
```

- [ ] **Step 5: Registra le rotte**

In `backend/routes/api.php`, dentro il gruppo `admin`, con quella dell'immagine **prima** delle altre:

```php
        Route::post('foods/{food}/image', [AdminFoodController::class, 'image']);
        Route::get('foods', [AdminFoodController::class, 'index']);
        Route::post('foods', [AdminFoodController::class, 'store']);
        Route::patch('foods/{food}', [AdminFoodController::class, 'update']);
        Route::delete('foods/{food}', [AdminFoodController::class, 'destroy']);
```

Import in cima: `use App\Http\Controllers\Api\Admin\AdminFoodController;`

- [ ] **Step 6: Lancia i test e verifica che passino**

```bash
cd backend && php artisan test --filter=AdminFoodTest
```

Atteso: PASS, 8 test.

- [ ] **Step 7: Commit**

```bash
cd backend && git add app/Http/Controllers/Api/Admin/AdminFoodController.php app/Http/Requests/Admin/AdminFoodRequest.php routes/api.php tests/Feature/Admin/AdminFoodTest.php
git commit -m "feat(admin): catalogo alimenti con valori, codice a barre e immagine"
```

---

### Task 14: Le tassonomie dal gestionale

**Files:**
- Create: `backend/app/Http/Controllers/Api/Admin/TaxonomyController.php`
- Create: `backend/app/Http/Requests/Admin/TaxonomyRequest.php`
- Modify: `backend/routes/api.php`
- Test: `backend/tests/Feature/Admin/AdminTaxonomyTest.php`

**Interfaces:**
- Consumes: `MuscleGroup`, `EquipmentType` dal Task 3; il middleware `admin` dal Task 10.
- Produces: `GET|POST /api/admin/taxonomies/{kind}` e `PATCH|DELETE /api/admin/taxonomies/{kind}/{id}`, dove `{kind}` e' `muscle-groups` o `equipment`. Corpo: `{ slug?, labelIt, labelEn, sort? }`. Lo `slug` si accetta solo in creazione.

- [ ] **Step 1: Scrivi il test che fallisce**

Crea `backend/tests/Feature/Admin/AdminTaxonomyTest.php`:

```php
<?php

namespace Tests\Feature\Admin;

use App\Models\Exercise;
use App\Models\MuscleGroup;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AdminTaxonomyTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->admin = User::factory()->create(['is_admin' => true]);
        $this->seed(\Database\Seeders\TaxonomySeeder::class);
    }

    public function test_l_elenco_esce_ordinato(): void
    {
        $this->actingAs($this->admin)
            ->getJson('/api/admin/taxonomies/muscle-groups')
            ->assertOk()
            ->assertJsonCount(12, 'data')
            ->assertJsonPath('data.0.slug', 'petto');
    }

    public function test_si_aggiunge_un_gruppo(): void
    {
        $this->actingAs($this->admin)
            ->postJson('/api/admin/taxonomies/muscle-groups', [
                'slug' => 'ischiocrurali',
                'labelIt' => 'Ischiocrurali',
                'labelEn' => 'Hamstrings',
                'sort' => 95,
            ])
            ->assertCreated();

        $this->assertNotNull(MuscleGroup::where('slug', 'ischiocrurali')->first());
    }

    public function test_uno_slug_si_scrive_solo_una_volta(): void
    {
        $petto = MuscleGroup::where('slug', 'petto')->first();

        $this->actingAs($this->admin)
            ->patchJson("/api/admin/taxonomies/muscle-groups/{$petto->id}", [
                'slug' => 'torace',
                'labelIt' => 'Torace',
                'labelEn' => 'Chest',
            ])
            ->assertOk();

        /*
         * L'etichetta cambia, lo slug no.
         *
         * Lo slug e' quel che sta scritto in colonna su ogni esercizio:
         * cambiarlo lascerebbe orfani tutti gli esercizi del petto, sul
         * server e su ogni telefono, senza che niente lo dica. Rinominare e'
         * un fatto sull'etichetta.
         */
        $petto->refresh();
        $this->assertSame('petto', $petto->slug);
        $this->assertSame('Torace', $petto->label_it);
    }

    public function test_uno_slug_gia_preso_non_si_riusa(): void
    {
        $this->actingAs($this->admin)
            ->postJson('/api/admin/taxonomies/muscle-groups', [
                'slug' => 'petto',
                'labelIt' => 'Altro petto',
                'labelEn' => 'Other chest',
            ])
            ->assertStatus(422);
    }

    public function test_uno_slug_si_normalizza(): void
    {
        $this->actingAs($this->admin)
            ->postJson('/api/admin/taxonomies/equipment', [
                'slug' => 'Lat Machine',
                'labelIt' => 'Lat machine',
                'labelEn' => 'Lat pulldown',
            ])
            ->assertCreated();

        // Uno slug con spazi e maiuscole finirebbe in colonna cosi' com'e' e
        // non combacerebbe mai con quel che l'app si aspetta.
        $this->assertNotNull(\App\Models\EquipmentType::where('slug', 'lat_machine')->first());
    }

    public function test_non_si_cancella_un_gruppo_ancora_usato(): void
    {
        Exercise::create([
            'uid' => 'x', 'name' => 'Panca', 'name_norm' => 'panca',
            'muscle_group' => 'petto', 'status' => 'published',
        ]);
        $petto = MuscleGroup::where('slug', 'petto')->first();

        /*
         * Cancellandolo, ogni esercizio del petto resterebbe con uno slug che
         * non ha piu' un'etichetta. Il pull lo manda comunque come tombstone
         * e l'app ha una ricaduta, ma un elenco di esercizi senza gruppo e'
         * un danno che si puo' evitare chiedendo prima di spostarli.
         */
        $this->actingAs($this->admin)
            ->deleteJson("/api/admin/taxonomies/muscle-groups/{$petto->id}")
            ->assertStatus(422)
            ->assertJsonPath('errors.slug.0', 'Ci sono ancora 1 voci che lo usano.');
    }

    public function test_si_cancella_un_gruppo_non_usato(): void
    {
        $polpacci = MuscleGroup::where('slug', 'polpacci')->first();

        $this->actingAs($this->admin)
            ->deleteJson("/api/admin/taxonomies/muscle-groups/{$polpacci->id}")
            ->assertOk();

        $this->assertNull(MuscleGroup::find($polpacci->id));
    }

    public function test_il_corpo_libero_non_si_cancella(): void
    {
        $cl = \App\Models\EquipmentType::where('slug', 'corpo_libero')->first();

        // `EquipmentScreen` lo dichiara sempre presente e
        // `listAvailableEquipment` ragiona per esclusione a partire da li':
        // toglierlo cambierebbe il significato di ogni dichiarazione di
        // attrezzatura gia' fatta.
        $this->actingAs($this->admin)
            ->deleteJson("/api/admin/taxonomies/equipment/{$cl->id}")
            ->assertStatus(422);
    }

    public function test_un_tipo_sconosciuto_non_esiste(): void
    {
        $this->actingAs($this->admin)
            ->getJson('/api/admin/taxonomies/colori')
            ->assertNotFound();
    }

    public function test_chi_non_e_amministratore_non_entra(): void
    {
        $this->actingAs(User::factory()->create())
            ->getJson('/api/admin/taxonomies/muscle-groups')
            ->assertForbidden();
    }
}
```

- [ ] **Step 2: Lancia il test e verifica che fallisca**

```bash
cd backend && php artisan test --filter=AdminTaxonomyTest
```

Atteso: FAIL, 404.

- [ ] **Step 3: Scrivi il FormRequest**

Crea `backend/app/Http/Requests/Admin/TaxonomyRequest.php`:

```php
<?php

namespace App\Http\Requests\Admin;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Una voce di tassonomia.
 *
 * `slug` e' accettato SOLO in creazione, e il controller lo ignora in
 * correzione: e' quel che sta scritto in colonna su ogni esercizio, e
 * cambiarlo li lascerebbe orfani tutti in una volta.
 */
class TaxonomyRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // Il middleware `admin` ha gia' deciso.
    }

    /**
     * Lo slug si normalizza prima di validarlo.
     *
     * Chi scrive "Lat Machine" nel campo intende `lat_machine`: uno slug con
     * spazi e maiuscole finirebbe in colonna cosi' com'e' e non combacerebbe
     * mai con quel che l'app cerca. Meglio correggerlo che rifiutarlo.
     */
    protected function prepareForValidation(): void
    {
        if ($slug = $this->input('slug')) {
            $normalizzato = preg_replace('/[^a-z0-9]+/', '_', mb_strtolower((string) $slug));
            $this->merge(['slug' => trim((string) $normalizzato, '_')]);
        }
    }

    public function rules(): array
    {
        return [
            'slug' => [$this->isMethod('POST') ? 'required' : 'sometimes', 'string', 'max:40'],
            'labelIt' => [$this->isMethod('POST') ? 'required' : 'sometimes', 'string', 'max:60'],
            'labelEn' => [$this->isMethod('POST') ? 'required' : 'sometimes', 'string', 'max:60'],
            'sort' => ['sometimes', 'integer', 'min:0', 'max:9999'],
        ];
    }
}
```

- [ ] **Step 4: Scrivi il controller**

Crea `backend/app/Http/Controllers/Api/Admin/TaxonomyController.php`:

```php
<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\TaxonomyRequest;
use App\Models\EquipmentType;
use App\Models\Exercise;
use App\Models\MuscleGroup;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;

/**
 * I gruppi muscolari e gli attrezzi, dal gestionale.
 *
 * Un controller per due tipi, perche' sono la stessa tabella con un nome
 * diverso e le stesse quattro colonne: due controller gemelli divergerebbero
 * alla prima correzione fatta in uno solo.
 */
class TaxonomyController extends Controller
{
    /**
     * @var array<string, array{class-string<Model>, string}>
     *
     * Il tipo, il model, e la colonna degli esercizi che lo nomina - serve a
     * sapere se una voce e' ancora in uso prima di toglierla.
     */
    private const TIPI = [
        'muscle-groups' => [MuscleGroup::class, 'muscle_group'],
        'equipment' => [EquipmentType::class, 'equipment'],
    ];

    /**
     * Cio' che non si cancella mai.
     *
     * `corpo_libero` sta in `EquipmentScreen` come sempre presente, e
     * `listAvailableEquipment` ragiona per esclusione a partire da li':
     * toglierlo cambierebbe il significato di ogni dichiarazione di
     * attrezzatura gia' fatta da chiunque.
     */
    private const INTOCCABILI = ['corpo_libero'];

    public function index(string $kind): JsonResponse
    {
        [$classe] = $this->tipo($kind);

        return response()->json([
            'data' => $classe::query()
                ->orderBy('sort')->orderBy('slug')->get()
                ->map(fn (Model $r) => $this->forma($r)),
        ]);
    }

    public function store(TaxonomyRequest $request, string $kind): JsonResponse
    {
        [$classe] = $this->tipo($kind);
        $dati = $request->safe()->all();

        if ($classe::withTrashed()->where('slug', $dati['slug'])->exists()) {
            return response()->json([
                'message' => 'Questo identificativo e\' gia\' in uso.',
                'errors' => ['slug' => ['Identificativo gia\' in uso.']],
            ], 422);
        }

        $riga = $classe::create([
            'slug' => $dati['slug'],
            'label_it' => $dati['labelIt'],
            'label_en' => $dati['labelEn'],
            'sort' => $dati['sort'] ?? 0,
        ]);

        return response()->json(['data' => $this->forma($riga)], 201);
    }

    public function update(TaxonomyRequest $request, string $kind, int $id): JsonResponse
    {
        [$classe] = $this->tipo($kind);
        $riga = $classe::query()->findOrFail($id);
        $dati = $request->safe()->all();

        /*
         * `slug` non e' in questo elenco, ed e' il punto.
         *
         * Arriva nella richiesta perche' il form lo mostra, e viene ignorato:
         * e' quel che sta scritto in colonna su ogni esercizio che nomina
         * questa voce, e riscriverlo li lascerebbe orfani tutti in una volta,
         * qui e su ogni telefono. Rinominare "Femorali" in "Ischiocrurali" e'
         * un fatto sull'etichetta.
         */
        foreach (['labelIt' => 'label_it', 'labelEn' => 'label_en', 'sort' => 'sort'] as $input => $colonna) {
            if (array_key_exists($input, $dati)) {
                $riga->{$colonna} = $dati[$input];
            }
        }

        $riga->save();

        return response()->json(['data' => $this->forma($riga->fresh())]);
    }

    public function destroy(string $kind, int $id): JsonResponse
    {
        [$classe, $colonna] = $this->tipo($kind);
        $riga = $classe::query()->findOrFail($id);

        if (in_array($riga->slug, self::INTOCCABILI, true)) {
            return response()->json([
                'message' => 'Questa voce non si puo\' togliere.',
                'errors' => ['slug' => ['Voce di sistema.']],
            ], 422);
        }

        $usi = $this->usi($colonna, $riga->slug);

        if ($usi > 0) {
            /*
             * Non si toglie da sotto ai piedi di chi la usa.
             *
             * Il pull manderebbe comunque il tombstone e l'app ha una
             * ricaduta neutra, ma un elenco di esercizi senza gruppo e' un
             * danno che si evita chiedendo prima di spostarli.
             */
            return response()->json([
                'message' => "Ci sono ancora {$usi} voci che usano questo identificativo.",
                'errors' => ['slug' => ["Ci sono ancora {$usi} voci che lo usano."]],
            ], 422);
        }

        $riga->delete();

        return response()->json(['ok' => true]);
    }

    /** Quanti esercizi nominano ancora questo slug. */
    private function usi(string $colonna, string $slug): int
    {
        if ($colonna === 'muscle_group') {
            // Il gruppo primario e i secondari, che sono un elenco separato
            // da virgole: una voce usata solo come secondaria e' comunque
            // usata.
            return Exercise::withTrashed()
                ->where('muscle_group', $slug)
                ->orWhereRaw("',' || COALESCE(secondary_muscles, '') || ',' LIKE ?", ["%,{$slug},%"])
                ->count();
        }

        return Exercise::withTrashed()
            ->whereRaw("',' || COALESCE(equipment, '') || ',' LIKE ?", ["%,{$slug},%"])
            ->count();
    }

    /** @return array{class-string<Model>, string} */
    private function tipo(string $kind): array
    {
        abort_unless(array_key_exists($kind, self::TIPI), 404);

        return self::TIPI[$kind];
    }

    /** @return array<string, mixed> */
    private function forma(Model $r): array
    {
        return [
            'id' => $r->id,
            'slug' => $r->slug,
            'labelIt' => $r->label_it,
            'labelEn' => $r->label_en,
            'sort' => $r->sort,
        ];
    }
}
```

- [ ] **Step 5: Registra le rotte**

In `backend/routes/api.php`, dentro il gruppo `admin`:

```php
        Route::get('taxonomies/{kind}', [TaxonomyController::class, 'index']);
        Route::post('taxonomies/{kind}', [TaxonomyController::class, 'store']);
        Route::patch('taxonomies/{kind}/{id}', [TaxonomyController::class, 'update']);
        Route::delete('taxonomies/{kind}/{id}', [TaxonomyController::class, 'destroy']);
```

Import: `use App\Http\Controllers\Api\Admin\TaxonomyController;`

- [ ] **Step 6: Lancia i test e verifica che passino**

```bash
cd backend && php artisan test --filter=AdminTaxonomyTest
```

Atteso: PASS, 10 test.

Il test `test_non_si_cancella_un_gruppo_ancora_usato` verifica il messaggio parola per parola. Se il tuo messaggio e' scritto diversamente, cambia il test o il messaggio: devono combaciare, e sono una stringa sola in un posto solo.

- [ ] **Step 7: Commit**

```bash
cd backend && git add app/Http/Controllers/Api/Admin/TaxonomyController.php app/Http/Requests/Admin/TaxonomyRequest.php routes/api.php tests/Feature/Admin/AdminTaxonomyTest.php
git commit -m "feat(admin): gruppi muscolari e attrezzatura si governano da web"
```

---

### Task 15: Gli utenti e le statistiche della dashboard

**Files:**
- Modify: `backend/app/Http/Controllers/Api/AdminController.php`
- Create: `backend/app/Http/Requests/Admin/UpdateUserRequest.php`
- Modify: `backend/routes/api.php`
- Test: `backend/tests/Feature/AdminTest.php`

**Interfaces:**
- Consumes: `users.ai_enabled` dal Task 4; il middleware `admin` dal Task 10; `status` dai Task 1 e 2.
- Produces:
  - `GET /api/admin/users` arricchito: per ogni utente `id, handle, displayName, email, isAdmin, aiEnabled, createdAt, submitted, published`
  - `PATCH /api/admin/users/{user}` con corpo `{ aiEnabled?: bool }`
  - `GET /api/admin/stats` → `{ users, pending: {exercises, foods}, published: {exercises, foods}, missing: {instructions, photos} }`

- [ ] **Step 1: Scrivi il test che fallisce**

In `backend/tests/Feature/AdminTest.php`, aggiungi:

```php
    public function test_l_elenco_utenti_conta_le_proposte(): void
    {
        $admin = \App\Models\User::factory()->create(['is_admin' => true, 'handle' => 'martin']);
        $anna = \App\Models\User::factory()->create(['handle' => 'anna']);

        \App\Models\Food::create([
            'uid' => 'a', 'name' => 'Uno', 'name_norm' => 'uno',
            'status' => 'pending', 'created_by' => $anna->id,
        ]);
        \App\Models\Food::create([
            'uid' => 'b', 'name' => 'Due', 'name_norm' => 'due',
            'status' => 'published', 'created_by' => $anna->id,
        ]);

        $r = $this->actingAs($admin)->getJson('/api/admin/users')->assertOk();

        $riga = collect($r->json('users'))->firstWhere('handle', 'anna');
        // Due proposte fatte, una entrata in catalogo: e' il numero con cui
        // si riconosce chi propone spazzatura senza doverle riaprire tutte.
        $this->assertSame(2, $riga['submitted']);
        $this->assertSame(1, $riga['published']);
        $this->assertTrue($riga['aiEnabled']);
    }

    public function test_si_spegne_e_si_riaccende_l_ai_a_qualcuno(): void
    {
        $admin = \App\Models\User::factory()->create(['is_admin' => true]);
        $anna = \App\Models\User::factory()->create();

        $this->actingAs($admin)
            ->patchJson("/api/admin/users/{$anna->id}", ['aiEnabled' => false])
            ->assertOk();

        $this->assertFalse($anna->fresh()->ai_enabled);

        $this->actingAs($admin)
            ->patchJson("/api/admin/users/{$anna->id}", ['aiEnabled' => true])
            ->assertOk();

        $this->assertTrue($anna->fresh()->ai_enabled);
    }

    public function test_l_interruttore_ai_non_tocca_altro(): void
    {
        $admin = \App\Models\User::factory()->create(['is_admin' => true]);
        $anna = \App\Models\User::factory()->create(['is_admin' => false, 'handle' => 'anna']);

        // Il corpo di questa PATCH accetta un campo solo: promuovere qualcuno
        // ad amministratore non e' fra le cose che il gestionale fa, e un
        // `fill()` generoso lo renderebbe possibile per sbaglio.
        $this->actingAs($admin)
            ->patchJson("/api/admin/users/{$anna->id}", [
                'aiEnabled' => false,
                'isAdmin' => true,
                'handle' => 'rubato',
            ])
            ->assertOk();

        $anna->refresh();
        $this->assertFalse($anna->is_admin);
        $this->assertSame('anna', $anna->handle);
    }

    public function test_le_statistiche_dicono_cosa_manca(): void
    {
        $admin = \App\Models\User::factory()->create(['is_admin' => true]);

        \App\Models\Exercise::create([
            'uid' => 'a', 'name' => 'Con testo', 'name_norm' => 'con testo',
            'muscle_group' => 'petto', 'status' => 'published',
            'instructions' => 'Come si fa.', 'photo' => 'a.jpg',
        ]);
        \App\Models\Exercise::create([
            'uid' => 'b', 'name' => 'Muto', 'name_norm' => 'muto',
            'muscle_group' => 'petto', 'status' => 'published',
        ]);
        \App\Models\Food::create([
            'uid' => 'c', 'name' => 'Proposta', 'name_norm' => 'proposta',
            'status' => 'pending',
        ]);

        $this->actingAs($admin)->getJson('/api/admin/stats')
            ->assertOk()
            ->assertJsonPath('published.exercises', 2)
            ->assertJsonPath('pending.foods', 1)
            // I due numeri che dicono cosa manca: senza, 128 esercizi su 200
            // sono rimasti muti per mesi e nessuno lo sapeva.
            ->assertJsonPath('missing.instructions', 1)
            ->assertJsonPath('missing.photos', 1);
    }

    public function test_le_statistiche_sono_chiuse_a_chi_non_e_amministratore(): void
    {
        $this->actingAs(\App\Models\User::factory()->create())
            ->getJson('/api/admin/stats')
            ->assertForbidden();
    }
```

- [ ] **Step 2: Lancia il test e verifica che fallisca**

```bash
cd backend && php artisan test --filter=AdminTest
```

Atteso: FAIL, chiave `submitted` mancante e 404 su `/api/admin/stats`.

- [ ] **Step 3: Scrivi il FormRequest**

Crea `backend/app/Http/Requests/Admin/UpdateUserRequest.php`:

```php
<?php

namespace App\Http\Requests\Admin;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Cio' che il gestionale puo' cambiare di un utente.
 *
 * UN CAMPO SOLO, e l'elenco corto e' la protezione. Promuovere qualcuno ad
 * amministratore, rinominarlo o sospenderlo non sono cose che questo pannello
 * fa - e finche' non lo sono, non devono poter succedere per sbaglio a causa
 * di un `fill()` generoso su un corpo che arriva dal browser.
 *
 * Il reset password ha la sua rotta, con il suo limite per tentativi.
 */
class UpdateUserRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // Il middleware `admin` ha gia' deciso.
    }

    public function rules(): array
    {
        return ['aiEnabled' => ['sometimes', 'boolean']];
    }
}
```

- [ ] **Step 4: Arricchisci `AdminController`**

In `backend/app/Http/Controllers/Api/AdminController.php`, sostituisci il metodo `users()` e aggiungi due metodi:

```php
    /** L'elenco, con quel che serve a riconoscere chi propone cosa. */
    public function users(): JsonResponse
    {
        return response()->json([
            'users' => User::query()
                /*
                 * I due conteggi in una query sola per tipo, non uno per
                 * utente: con cento iscritti sarebbero quattrocento query per
                 * disegnare una tabella.
                 */
                ->withCount([
                    'proposedExercises as submitted_exercises',
                    'proposedFoods as submitted_foods',
                    'proposedExercises as published_exercises' => fn ($q) => $q->where('status', 'published'),
                    'proposedFoods as published_foods' => fn ($q) => $q->where('status', 'published'),
                ])
                ->orderBy('handle')
                ->get()
                ->map(fn (User $u) => [
                    'id' => $u->id,
                    'handle' => $u->handle,
                    'displayName' => $u->display_name ?? $u->name,
                    'email' => $u->email,
                    'isAdmin' => $u->is_admin,
                    'aiEnabled' => $u->ai_enabled,
                    'createdAt' => $u->created_at?->toIso8601String(),
                    'submitted' => $u->submitted_exercises + $u->submitted_foods,
                    'published' => $u->published_exercises + $u->published_foods,
                ]),
        ]);
    }

    /**
     * L'interruttore dell'AI.
     *
     * E' UN CARTELLO E NON UNA SERRATURA finche' le chiamate a Gemini partono
     * dal telefono con la chiave nel bundle: spegnerlo nasconde il microfono
     * e nient'altro. Serve gia' a regalare l'AI a chi si vuole, e diventa un
     * diritto vero quando le chiamate passeranno da qui - `TODO.md` § 3.1.
     */
    public function updateUser(UpdateUserRequest $request, User $user): JsonResponse
    {
        $dati = $request->safe()->all();

        if (array_key_exists('aiEnabled', $dati)) {
            $user->ai_enabled = $dati['aiEnabled'];
            $user->save();
        }

        return response()->json([
            'id' => $user->id,
            'handle' => $user->handle,
            'aiEnabled' => $user->ai_enabled,
        ]);
    }

    /**
     * I numeri della dashboard.
     *
     * I due sotto `missing` non sono decorazione: 128 esercizi su 200 sono
     * rimasti senza descrizione per mesi, e la ragione e' che nessuna
     * schermata contava quanti fossero. Un numero in cima alla dashboard e un
     * filtro che ci porta dentro (`?missing=instructions`) sono le due meta'
     * dello stesso rimedio.
     */
    public function stats(): JsonResponse
    {
        return response()->json([
            'users' => User::count(),
            'pending' => [
                'exercises' => Exercise::where('status', 'pending')->count(),
                'foods' => Food::where('status', 'pending')->count(),
            ],
            'published' => [
                'exercises' => Exercise::where('status', 'published')->count(),
                'foods' => Food::where('status', 'published')->count(),
            ],
            'missing' => [
                'instructions' => Exercise::where('status', 'published')
                    ->where(fn ($q) => $q->whereNull('instructions')->orWhere('instructions', ''))
                    ->count(),
                'photos' => Exercise::where('status', 'published')
                    ->whereNull('photo')
                    ->count(),
            ],
        ]);
    }
```

Aggiungi gli import in cima al file:

```php
use App\Http\Requests\Admin\UpdateUserRequest;
use App\Models\Exercise;
use App\Models\Food;
```

Il metodo `resetPassword` resta com'e'.

- [ ] **Step 5: Aggiungi le due relazioni a `User`**

In `backend/app/Models/User.php`, accanto a `sharedStats()`:

```php
    /**
     * Le voci di catalogo che ha proposto.
     *
     * Servono ai due conteggi dell'elenco utenti del gestionale, e a niente
     * altro: `created_by` non esce verso un utente normale, e queste
     * relazioni non vanno usate da nessuna rotta fuori da `/api/admin/*`.
     */
    public function proposedExercises(): HasMany
    {
        return $this->hasMany(Exercise::class, 'created_by');
    }

    public function proposedFoods(): HasMany
    {
        return $this->hasMany(Food::class, 'created_by');
    }
```

- [ ] **Step 6: Registra le due rotte**

In `backend/routes/api.php`, dentro il gruppo `admin`:

```php
        Route::get('stats', [AdminController::class, 'stats']);
        Route::patch('users/{user}', [AdminController::class, 'updateUser']);
```

- [ ] **Step 7: Lancia i test e verifica che passino**

```bash
cd backend && php artisan test --filter=AdminTest
```

Atteso: PASS.

- [ ] **Step 8: Commit**

```bash
cd backend && git add app/Http/Controllers/Api/AdminController.php app/Http/Requests/Admin/UpdateUserRequest.php app/Models/User.php routes/api.php tests/Feature/AdminTest.php
git commit -m "feat(admin): elenco utenti con l'interruttore AI e i numeri della dashboard"
```

---

### Task 16: L'accesso del gestionale

**Files:**
- Create: `backend/app/Http/Controllers/AdminAuthController.php`
- Create: `backend/app/Http/Requests/Admin/AdminLoginRequest.php`
- Modify: `backend/routes/web.php`
- Modify: `backend/bootstrap/app.php`
- Modify: `backend/config/sanctum.php`
- Test: `backend/tests/Feature/Admin/AdminAuthTest.php`

**Interfaces:**
- Consumes: `EnsureAdmin` dal Task 10.
- Produces: `POST /admin/login` con corpo `{ login, password }` (sessione, non token), `POST /admin/logout`, e `GET /admin/{any?}` che rende la SPA. Le rotte `/api/admin/*` accettano sia il token Sanctum sia il cookie di sessione.

- [ ] **Step 1: Scrivi il test che fallisce**

Crea `backend/tests/Feature/Admin/AdminAuthTest.php`:

```php
<?php

namespace Tests\Feature\Admin;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AdminAuthTest extends TestCase
{
    use RefreshDatabase;

    public function test_un_amministratore_entra(): void
    {
        User::factory()->create([
            'handle' => 'martin',
            'email' => 'martin@example.test',
            'password' => 'password123',
            'is_admin' => true,
        ]);

        $this->postJson('/admin/login', [
            'login' => 'martin@example.test',
            'password' => 'password123',
        ])->assertOk();

        $this->assertAuthenticated();
    }

    public function test_si_entra_anche_col_nome_utente(): void
    {
        User::factory()->create([
            'handle' => 'Martin',
            'password' => 'password123',
            'is_admin' => true,
        ]);

        // "A" e "a" sono lo stesso nome, ovunque: e' la regola di
        // `User::whereHandle`, e vale anche qui.
        $this->postJson('/admin/login', [
            'login' => 'martin',
            'password' => 'password123',
        ])->assertOk();
    }

    public function test_chi_non_e_amministratore_non_entra(): void
    {
        User::factory()->create([
            'email' => 'anna@example.test',
            'password' => 'password123',
            'is_admin' => false,
        ]);

        /*
         * Rifiuta all'accesso, non dopo.
         *
         * Farlo entrare e poi mostrargli pagine vuote sarebbe peggio in due
         * modi: sembrerebbe un'app rotta, e lascerebbe una sessione aperta a
         * qualcuno che non deve averne una.
         */
        $this->postJson('/admin/login', [
            'login' => 'anna@example.test',
            'password' => 'password123',
        ])->assertStatus(422);

        $this->assertGuest();
    }

    public function test_la_password_sbagliata_non_entra(): void
    {
        User::factory()->create([
            'email' => 'martin@example.test',
            'password' => 'password123',
            'is_admin' => true,
        ]);

        $this->postJson('/admin/login', [
            'login' => 'martin@example.test',
            'password' => 'sbagliata',
        ])->assertStatus(422);

        $this->assertGuest();
    }

    public function test_con_la_sessione_si_chiamano_le_rotte_admin(): void
    {
        $admin = User::factory()->create([
            'email' => 'martin@example.test',
            'password' => 'password123',
            'is_admin' => true,
        ]);

        $this->postJson('/admin/login', [
            'login' => 'martin@example.test',
            'password' => 'password123',
        ])->assertOk();

        // E' il punto di tutta la scelta: la SPA chiama l'API col cookie di
        // sessione, senza un token da custodire nel browser.
        $this->getJson('/api/admin/stats')->assertOk();
    }

    public function test_si_esce(): void
    {
        $admin = User::factory()->create(['is_admin' => true]);
        $this->actingAs($admin);

        $this->postJson('/admin/logout')->assertOk();

        $this->assertGuest();
    }
}
```

- [ ] **Step 2: Lancia il test e verifica che fallisca**

```bash
cd backend && php artisan test --filter=AdminAuthTest
```

Atteso: FAIL, 404 su `/admin/login`.

- [ ] **Step 3: Scrivi il FormRequest**

Crea `backend/app/Http/Requests/Admin/AdminLoginRequest.php`:

```php
<?php

namespace App\Http\Requests\Admin;

use Illuminate\Foundation\Http\FormRequest;

/**
 * L'accesso al gestionale.
 *
 * `login` e' l'email o il nome utente, come in `LoginRequest`: chi entra non
 * deve ricordarsi quale dei due questo modulo si aspetta.
 */
class AdminLoginRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'login' => ['required', 'string', 'max:255'],
            'password' => ['required', 'string'],
        ];
    }
}
```

- [ ] **Step 4: Scrivi il controller**

Crea `backend/app/Http/Controllers/AdminAuthController.php`:

```php
<?php

namespace App\Http\Controllers;

use App\Http\Requests\Admin\AdminLoginRequest;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

/**
 * L'accesso al gestionale.
 *
 * SESSIONE E NON TOKEN, ed e' l'unica differenza sostanziale con
 * `AuthController`, che serve l'app. Un token per una SPA va custodito nel
 * browser, e cio' che sta in `localStorage` un XSS se lo porta via; il cookie
 * di sessione e' `httpOnly` e la sessione qui c'e' gia' - `SESSION_DRIVER` e'
 * `database` e la tabella `sessions` esiste dalla prima migrazione.
 *
 * L'app continua a usare `POST /api/login` e i suoi token: sono due client
 * diversi con due esigenze diverse, e non c'e' motivo di forzarli sullo
 * stesso meccanismo.
 */
class AdminAuthController extends Controller
{
    public function login(AdminLoginRequest $request): JsonResponse
    {
        $dati = $request->validated();

        $user = User::whereHandle($dati['login'])->first()
            ?? User::where('email', $dati['login'])->first();

        if ($user === null || ! Hash::check($dati['password'], $user->password)) {
            throw ValidationException::withMessages([
                // Lo stesso messaggio per utente inesistente e password
                // sbagliata: distinguerli direbbe a chi prova quali indirizzi
                // esistono.
                'login' => [__('auth.failed')],
            ]);
        }

        /*
         * Il controllo su `is_admin` sta QUI, all'accesso.
         *
         * Il middleware `admin` fermerebbe comunque ogni sua richiesta, ma
         * farlo entrare e poi mostrargli pagine vuote sembrerebbe un'app
         * rotta - e lascerebbe una sessione aperta a chi non deve averne una.
         */
        if (! $user->is_admin) {
            throw ValidationException::withMessages([
                'login' => [__('auth.failed')],
            ]);
        }

        Auth::login($user, remember: true);
        $request->session()->regenerate();

        return response()->json([
            'handle' => $user->handle,
            'displayName' => $user->display_name ?? $user->name,
        ]);
    }

    public function logout(Request $request): JsonResponse
    {
        Auth::logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->json(['ok' => true]);
    }

    /** La SPA. Ogni percorso sotto `/admin` rende la stessa pagina. */
    public function spa(): \Illuminate\View\View
    {
        return view('admin');
    }
}
```

- [ ] **Step 5: Crea la vista che ospita la SPA**

Crea `backend/resources/views/admin.blade.php`:

```blade
<!DOCTYPE html>
<html lang="it">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>KalTrack - Gestionale</title>
    @viteReactRefresh
    @vite(['resources/js/admin/main.tsx'])
</head>
<body>
    <div id="admin-root"></div>
</body>
</html>
```

Il file `resources/js/admin/main.tsx` non esiste ancora: lo crea la Fase 2. Finche' non c'e', `npm run dev` fallira' su quell'input - e' atteso, e i test PHP non ne dipendono.

- [ ] **Step 6: Registra le rotte**

Sostituisci `backend/routes/web.php` con:

```php
<?php

use App\Http\Controllers\AdminAuthController;
use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return view('welcome');
});

/*
 * Il gestionale.
 *
 * Sta in `web.php` e non in `api.php` perche' ha bisogno della sessione e del
 * token CSRF, che il gruppo `api` non monta. La SPA chiama poi `/api/admin/*`
 * con lo stesso cookie: Sanctum accetta la sessione per le richieste che
 * arrivano da un dominio dichiarato stateful.
 */
Route::post('admin/login', [AdminAuthController::class, 'login'])
    // Come `login` e `register` dell'app: e' l'unica porta che chiunque puo'
    // bussare, e va limitata per tentativi.
    ->middleware('throttle:6,1');
Route::post('admin/logout', [AdminAuthController::class, 'logout']);

/*
 * Il catch-all va per ULTIMO, o mangerebbe le due rotte qui sopra: React
 * Router disegna le sue pagine dal percorso, e il server deve rendere la
 * stessa pagina per ognuno.
 */
Route::get('admin/{any?}', [AdminAuthController::class, 'spa'])
    ->where('any', '.*');
```

- [ ] **Step 7: Rendi stateful le rotte API**

In `backend/bootstrap/app.php`, dentro `withMiddleware`, aggiungi prima della riga di `$middleware->api(...)`:

```php
        /*
         * Il cookie di sessione vale anche sulle rotte `/api/*`.
         *
         * Senza, la SPA del gestionale dovrebbe custodire un token nel
         * browser. Con, le sue richieste passano col cookie httpOnly che ha
         * gia'. L'app non ne e' toccata: continua a mandare il suo Bearer, e
         * Sanctum accetta entrambi.
         */
        $middleware->statefulApi();
```

- [ ] **Step 8: Dichiara il dominio stateful**

In `backend/config/sanctum.php`, il valore di `'stateful'` legge gia' `SANCTUM_STATEFUL_DOMAINS` con un default che comprende `localhost` e `APP_URL`. Verifica che `kaltrack.martin-trajkovski.it` ci finisca:

```bash
cd backend && php artisan tinker --execute="print_r(config('sanctum.stateful'));"
```

Se il dominio di produzione non c'e', aggiungilo in `.env` di produzione (**non** in quello di sviluppo committato):

```
SANCTUM_STATEFUL_DOMAINS=kaltrack.martin-trajkovski.it
```

Annotalo nella sezione "In produzione" di `backend/README.md`: e' una riga di `.env` che senza il gestionale non serviva, e chi rifa' il server da zero non la indovinerebbe.

- [ ] **Step 9: Lancia i test e verifica che passino**

```bash
cd backend && php artisan test --filter=AdminAuthTest
```

Atteso: PASS, 6 test.

Se `test_con_la_sessione_si_chiamano_le_rotte_admin` fallisce con 401, il problema e' `statefulApi()`: in test il dominio della richiesta e' `localhost`, che dev'essere in `sanctum.stateful`.

- [ ] **Step 10: Lancia l'intera suite**

```bash
cd backend && php artisan test
```

Atteso: PASS, tutto. In particolare `UnauthenticatedTest` e `PrivacyTest`: `statefulApi()` cambia come Sanctum decide chi sei, ed e' esattamente il genere di modifica che puo' aprire una porta senza dirlo.

- [ ] **Step 11: Commit**

```bash
cd backend && git add app/Http/Controllers/AdminAuthController.php app/Http/Requests/Admin/AdminLoginRequest.php resources/views/admin.blade.php routes/web.php bootstrap/app.php README.md tests/Feature/Admin/AdminAuthTest.php
git commit -m "feat(admin): accesso al gestionale con sessione invece che token"
```

---

## Chiusura della Fase 1

- [ ] **Verifica finale**

```bash
cd backend && php artisan test && ./vendor/bin/pint --test
cd /Users/martintrajkovski/Desktop/Progetti-personali/KalTrack && npm run typecheck && npx jest src/db/seed
```

Atteso: tutto verde. Se `pint` segnala formattazione, lancialo senza `--test` e committa a parte.

- [ ] **Prova a mano il percorso completo**

```bash
cd backend && php artisan migrate:fresh --seed && php artisan catalog:seed
php artisan tinker --execute="App\Models\User::factory()->create(['handle'=>'martin','email'=>'martin@test.it','password'=>'password123','is_admin'=>true]);"
php artisan serve
```

Poi da un altro terminale: accedi, chiedi le statistiche, e verifica che il catalogo esca.

```bash
curl -c /tmp/kt.txt -b /tmp/kt.txt -X POST http://127.0.0.1:8000/admin/login \
  -H 'Accept: application/json' -H 'Content-Type: application/json' \
  -d '{"login":"martin@test.it","password":"password123"}'
curl -b /tmp/kt.txt http://127.0.0.1:8000/api/admin/stats -H 'Accept: application/json'
```

Atteso: il login torna l'handle, e le statistiche dicono 200 esercizi pubblicati e 128 senza descrizione... **no**: dopo il Task 5 le istruzioni ci sono tutte, quindi `missing.instructions` dev'essere 0 e `missing.photos` 200. Se `instructions` non e' zero, il seed non e' stato riesportato.

- [ ] **Aggiorna la documentazione**

Tre punti di `CLAUDE.md` alla root dell'app ora dicono il falso:

1. § L'unica cosa che esce verso i non amici: non e' piu' vero che "un esercizio o un alimento creato a mano entra nell'elenco di chiunque abbia un account". Si propone, e l'amministratore decide.
2. § Il catalogo degli esercizi: la frase "Il catalogo comune sul server non aiuta su nessuna delle due" (istruzioni e foto) non vale piu' - il server le ha entrambe.
3. § La ricerca di un alimento: l'avvertimento contro il tenere in colonna un id del server va precisato, perche' la Fase 3 aggiungera' `catalog_uid` e il motivo per cui li' non vale sta nella spec.

E in `backend/README.md`: la sezione sui cataloghi comuni, `SANCTUM_STATEFUL_DOMAINS`, e `catalog:seed` nell'entrypoint.

Non riscriverli adesso se la Fase 3 e' vicina: i tre punti si aggiornano insieme quando il ciclo e' chiuso. Ma **annotalo in `TODO.md`**, o restano falsi per mesi.

- [ ] **Commit finale della fase**

```bash
cd /Users/martintrajkovski/Desktop/Progetti-personali/KalTrack
git add TODO.md backend/README.md
git commit -m "docs: quel che la Fase 1 del gestionale ha cambiato"
```
