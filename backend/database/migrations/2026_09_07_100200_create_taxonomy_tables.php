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
