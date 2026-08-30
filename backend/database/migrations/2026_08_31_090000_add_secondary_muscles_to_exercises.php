<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * I muscoli secondari di un esercizio.
 *
 * Mancavano, e non era una semplificazione innocua: gli esercizi importati dal
 * catalogo arrivavano con la lista vuota, e `suggestAlternatives` - che
 * propone il sostituto quando un attrezzo e' occupato - lavora anche su
 * quelli. Un catalogo che li perde produce alternative peggiori proprio sugli
 * esercizi che uno non ha inserito a mano.
 *
 * Elenco separato da virgole come `equipment`, e per la stessa ragione: sono
 * un insieme chiuso e corto, e una tabella di appoggio per due parole per riga
 * sarebbe una join in piu' su ogni ricerca.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('exercises', function (Blueprint $table) {
            $table->string('secondary_muscles', 200)->nullable()->after('muscle_group');
        });
    }

    public function down(): void
    {
        Schema::table('exercises', function (Blueprint $table) {
            $table->dropColumn('secondary_muscles');
        });
    }
};
