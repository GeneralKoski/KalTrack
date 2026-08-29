<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Un contatore monotono al posto del tempo, come segnaposto della pull.
 *
 * `synced_at` non poteva reggere quel ruolo, per tre motivi che si sommavano:
 *
 *  - ha precisione al SECONDO, e il cursore veniva serializzato senza
 *    sub-secondi: due dispositivi che sincronizzavano nello stesso secondo si
 *    perdevano le righe a vicenda, per sempre;
 *  - non veniva riscritto sugli UPDATE, quindi una riga modificata non si
 *    ripropagava agli altri dispositivi;
 *  - resta comunque un orologio, e un orologio puo' tornare indietro.
 *
 * Un intero che cresce di uno a ogni scrittura non ha nessuno di questi
 * problemi: e' esatto, avanza anche sugli aggiornamenti, e non dipende da che
 * ora crede che sia il server.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('sync_records', function (Blueprint $table) {
            $table->unsignedBigInteger('sequence')->default(0)->after('synced_at');
            // L'indice della pull: "cosa e' cambiato per me dopo questo punto".
            $table->index(['user_id', 'sequence']);
        });

        // Le righe che ci sono gia' prendono un numero, nell'ordine in cui
        // erano arrivate: senza, partirebbero tutte da zero e un dispositivo
        // che ha gia' un cursore non le rivedrebbe mai.
        $rows = DB::table('sync_records')->orderBy('id')->pluck('id');
        foreach ($rows as $index => $id) {
            DB::table('sync_records')
                ->where('id', $id)
                ->update(['sequence' => $index + 1]);
        }
    }

    public function down(): void
    {
        Schema::table('sync_records', function (Blueprint $table) {
            $table->dropIndex(['user_id', 'sequence']);
            $table->dropColumn('sequence');
        });
    }
};
