<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Quel che si pubblica di un allenamento: un esercizio di un giorno per riga.
 *
 * Tabella a parte e non colonne in piu' su `shared_stats`: un giorno ha molti
 * esercizi, e un JSON dentro `shared_stats` renderebbe impossibile chiedere
 * "chi ha alzato di piu' in panca" senza rileggere tutto in PHP.
 *
 * IL NOME DELL'ESERCIZIO E' TESTO, non un id. Gli id degli esercizi nascono
 * sul telefono e due dispositivi non li condividono: un id qui sarebbe un
 * riferimento a niente per chiunque non sia il telefono che l'ha scritto.
 *
 * Quel che NON c'e' e' una scelta: nessuna nota, nessun commento, nessuna
 * serie singola. Il dettaglio di un allenamento resta sul telefono come il
 * diario. Qui c'e' il minimo che rende il confronto sensato.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('shared_workouts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->date('date');
            $table->string('exercise_name', 120);
            $table->unsignedSmallInteger('sets');
            $table->unsignedSmallInteger('total_reps');
            // Il volume di una sessione pesante sta largamente sotto i cinque
            // numeri interi; il decimale serve ai carichi da mezzo chilo.
            $table->decimal('volume_kg', 9, 2);
            $table->decimal('top_weight_kg', 6, 2)->nullable();
            $table->timestamps();

            // Un esercizio compare una volta per giorno, gia' aggregato: le
            // serie singole non escono, quindi non c'e' niente da distinguere.
            $table->unique(['user_id', 'date', 'exercise_name']);
            $table->index(['user_id', 'date']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('shared_workouts');
    }
};
