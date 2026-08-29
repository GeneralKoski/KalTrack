<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Il deposito della sincronizzazione: una riga per ogni riga del telefono.
 *
 * UNA tabella sola invece di ventisette speculari, e il payload in JSON. Il
 * server qui non elabora niente: tiene una copia e la restituisce. Rifare lo
 * schema dell'app di qua vorrebbe dire mantenere due volte ogni migrazione, e
 * bastera' una divergenza perche' un campo nuovo si perda in silenzio.
 *
 * Quel poco che il server deve interrogare - i totali che si condividono con
 * gli amici - passa da `shared_stats`, che ha colonne vere apposta.
 *
 * `deleted_at` viaggia nel payload E in colonna: la colonna serve a mandare le
 * cancellazioni agli altri dispositivi senza aprire il JSON di ogni riga.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sync_records', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('table_name', 40);
            // L'id e' l'UUID che ha generato il telefono: e' la stessa riga su
            // ogni dispositivo, ed e' quello che rende la copia riconciliabile.
            $table->uuid('record_id');
            $table->json('payload');
            /*
             * L'ora di modifica DEL TELEFONO, non del server.
             *
             * E' su questa che si decide chi vince un conflitto, e deve essere
             * quella del dispositivo: usare l'ora di arrivo farebbe vincere
             * chi si e' sincronizzato per ultimo invece di chi ha scritto per
             * ultimo, e un telefono rimasto offline una settimana
             * sovrascriverebbe modifiche piu' recenti.
             */
            $table->timestamp('updated_at');
            $table->timestamp('deleted_at')->nullable();
            $table->timestamp('created_at');
            // Quando il server l'ha ricevuta: e' il segnaposto della PULL,
            // separato da updated_at perche' un telefono con l'orologio
            // sbagliato non deve poter saltare righe altrui.
            $table->timestamp('synced_at')->useCurrent();

            $table->unique(['user_id', 'table_name', 'record_id']);
            // L'indice della pull: "cosa e' cambiato per me dopo questo punto".
            $table->index(['user_id', 'synced_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sync_records');
    }
};
