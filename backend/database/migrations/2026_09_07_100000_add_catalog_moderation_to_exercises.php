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
        });

        Schema::table('exercises', function (Blueprint $table) {
            $table->dropConstrainedForeignId('reviewed_by');
        });

        Schema::table('exercises', function (Blueprint $table) {
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
