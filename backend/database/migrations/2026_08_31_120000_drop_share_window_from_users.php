<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Via la finestra: si pubblica tutto lo storico.
 *
 * `share_window_days` diceva quanti giorni di passato uscivano, sette di
 * serie. Era un'impostazione in piu' su una domanda che nessuno si e' mai
 * posto davvero, e nel frattempo tagliava il confronto a una settimana: due
 * persone che si allenano da mesi vedevano sempre e solo gli ultimi sette
 * giorni. Cosa esce lo dicono i cinque interruttori, che restano.
 *
 * Le righe gia' pubblicate NON si toccano: la colonna serviva a cancellarne,
 * non a tenerle, e toglierla non e' un motivo per buttare via dello storico.
 *
 * Il `down()` rimette la colonna col suo default, ma non puo' rimettere i
 * giorni che il vecchio `forgetOutsideWindow` aveva gia' cancellato: quelli
 * erano persi prima di questa migrazione.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('share_window_days');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->unsignedSmallInteger('share_window_days')->default(7);
        });
    }
};
