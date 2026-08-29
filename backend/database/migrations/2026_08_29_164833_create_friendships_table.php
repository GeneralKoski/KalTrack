<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Le amicizie, come richiesta con un verso.
 *
 * Una riga sola per coppia, non due: chi ha chiesto resta distinguibile da chi
 * ha accettato, e questo serve a mostrare le richieste in entrata separate da
 * quelle in uscita. L'unicita' e' sulla coppia ordinata; che A non possa
 * chiedere a B mentre B ha gia' chiesto ad A e' una regola applicativa, non
 * uno unique index, perche' dipende dallo stato.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('friendships', function (Blueprint $table) {
            $table->id();
            $table->foreignId('requester_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('addressee_id')->constrained('users')->cascadeOnDelete();
            // pending finche' non risponde; accepted quando accetta. Il rifiuto
            // cancella la riga invece di lasciarla: una richiesta rifiutata non
            // e' uno stato da conservare, e tenerla impedirebbe di richiedere.
            $table->string('status', 20)->default('pending');
            $table->timestamp('responded_at')->nullable();
            $table->timestamps();

            $table->unique(['requester_id', 'addressee_id']);
            $table->index(['addressee_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('friendships');
    }
};
