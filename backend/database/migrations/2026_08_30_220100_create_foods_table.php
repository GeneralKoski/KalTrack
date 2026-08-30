<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Il catalogo degli alimenti, comune a tutti gli iscritti.
 *
 * Stessa scelta del catalogo esercizi e stesse regole: un alimento creato a
 * mano entra nell'elenco di chiunque abbia un account, la deduplica passa da
 * `name_norm`, e l'autore si registra ma non esce mai - serve solo a decidere
 * chi puo' correggere una voce.
 *
 * Serve anche alle ricette: una ricetta che si voglia condividere e' fatta di
 * alimenti, e senza un elenco comune i suoi ingredienti sull'altro telefono
 * sarebbero riferimenti a niente.
 *
 * I valori sono PER 100 g o 100 ml, come nella tabella del telefono: cambiare
 * unita' fra i due lati vorrebbe dire un fattore di conversione da ricordare a
 * ogni lettura, ed e' il genere di dettaglio che si dimentica una volta e
 * sballa un diario intero.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('foods', function (Blueprint $table) {
            $table->id();
            $table->string('name', 120);
            $table->string('name_norm', 120)->unique();
            $table->string('brand', 60)->nullable();

            // I valori nutrizionali, per 100 g / 100 ml.
            $table->decimal('kcal', 7, 2)->default(0);
            $table->decimal('protein', 7, 2)->default(0);
            $table->decimal('carbs', 7, 2)->default(0);
            $table->decimal('sugars', 7, 2)->default(0);
            $table->decimal('fat', 7, 2)->default(0);
            $table->decimal('saturated_fat', 7, 2)->default(0);
            $table->decimal('fiber', 7, 2)->default(0);
            $table->decimal('salt', 7, 2)->default(0);

            $table->boolean('is_liquid')->default(false);
            $table->decimal('default_serving_g', 7, 2)->nullable();
            $table->string('serving_label', 40)->nullable();

            // Come per gli esercizi: si registra e non esce mai.
            $table->foreignId('created_by')
                ->nullable()
                ->constrained('users')
                ->nullOnDelete();

            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('foods');
    }
};
