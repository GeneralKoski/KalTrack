<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Chi ha aggiunto una voce del catalogo.
 *
 * E' UN CAMBIO RISPETTO A COME ERA NATO IL CATALOGO, che apposta non registrava
 * l'autore. La ragione e' che senza proprietario non esiste "il mio": una voce
 * scritta male restava nell'app di tutti per sempre, perche' non c'era modo di
 * dire chi avesse il diritto di correggerla.
 *
 * QUEL CHE NON CAMBIA E' COSA ESCE: l'autore non compare in nessuna risposta.
 * Il client riceve solo `mine`, cioe' "questa la puoi modificare tu". Sapere
 * che un esercizio l'ha inventato Tizio resta un fatto su Tizio che non serve a
 * nessuno per allenarsi; sapere che l'hai inventato tu serve a te per
 * correggerlo.
 *
 * Nullable per le voci gia' in catalogo e per quelle di chi cancella l'account:
 * una voce senza proprietario resta in elenco e non la modifica piu' nessuno.
 * Sparire dal servizio non deve poter svuotare il catalogo di tutti.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('exercises', function (Blueprint $table) {
            $table->foreignId('created_by')
                ->nullable()
                ->constrained('users')
                ->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('exercises', function (Blueprint $table) {
            $table->dropConstrainedForeignId('created_by');
        });
    }
};
