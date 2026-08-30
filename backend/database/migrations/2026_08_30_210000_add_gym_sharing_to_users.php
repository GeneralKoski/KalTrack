<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * L'interruttore della palestra, e la finestra di quel che si pubblica.
 *
 * `share_gym` e' il quinto interruttore ma non e' come gli altri quattro:
 * quelli fanno uscire un totale di giornata, questo fa uscire il CONTENUTO di
 * un allenamento - quali esercizi, con quanto carico. E' una promessa diversa,
 * quindi e' una colonna diversa: chi aveva acceso `share_workouts` (il
 * conteggio) non deve ritrovarsi acceso anche questo.
 *
 * Parte da false come tutte le altre, e per la stessa ragione.
 *
 * `share_window_days` sta qui accanto e non fra le impostazioni del telefono:
 * dice quanto passato si pubblica, quindi parla dei dati e non del
 * dispositivo, e deve valere uguale da qualunque telefono si sincronizzi.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->boolean('share_gym')->default(false);
            // Il default resta la finestra prudente gia' in uso per i totali:
            // abbastanza per un profilo, poco per essere un archivio.
            $table->unsignedSmallInteger('share_window_days')->default(7);
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn(['share_gym', 'share_window_days']);
        });
    }
};
