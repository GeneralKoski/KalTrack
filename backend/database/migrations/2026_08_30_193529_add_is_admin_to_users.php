<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Chi puo' rimettere a posto la password di qualcun altro.
 *
 * Una colonna e non "l'utente con id 1". Gli id non sono un ruolo: in questo
 * database il numero 1 non esiste piu' - e' stato un account di prova,
 * cancellato - e SQLite non lo riassegna. Una regola scritta su quel numero
 * sarebbe nata gia' morta, e nessuno se ne sarebbe accorto finche' non fosse
 * servita.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            // Spento per tutti: un permesso si concede, non si eredita.
            $table->boolean('is_admin')->default(false);
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('is_admin');
        });
    }
};
