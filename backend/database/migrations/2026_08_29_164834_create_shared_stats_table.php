<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Il riepilogo che il telefono pubblica, un giorno per riga.
 *
 * Il server NON riceve il diario: riceve i totali di giornata, e solo quelli
 * che l'utente ha scelto di condividere. Il dettaglio di cosa si e' mangiato
 * resta sul telefono, dove e' sempre stato.
 *
 * Ogni colonna e' nullable perche' "non condiviso" e "non registrato" devono
 * restare distinguibili da uno zero.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('shared_stats', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->date('date');
            $table->unsignedInteger('kcal')->nullable();
            $table->unsignedInteger('steps')->nullable();
            $table->decimal('weight_kg', 5, 2)->nullable();
            $table->unsignedTinyInteger('workouts')->nullable();
            $table->timestamps();

            $table->unique(['user_id', 'date']);
            $table->index(['user_id', 'date']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('shared_stats');
    }
};
