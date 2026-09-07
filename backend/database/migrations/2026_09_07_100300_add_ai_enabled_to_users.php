<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Chi ha diritto alle funzioni AI.
 *
 * ACCESA DI SERIE, al contrario di `is_admin` che nasce spenta. Un permesso si
 * concede, ma questo non è un permesso nuovo: oggi l'AI è attiva per
 * chiunque, gratuita, con la chiave nel bundle dell'app. Nascere spenta la
 * toglierebbe a tutti quelli che la usano già. Il default si rovescia il
 * giorno in cui le chiamate passano dal backend e si comincia a pagarle
 * (`TODO.md` § 3.1), e da quel giorno la colonna diventa un diritto da
 * concedere.
 *
 * FINCHE' QUEL GIORNO NON ARRIVA, QUESTA COLONNA E' UN CARTELLO E NON UNA
 * SERRATURA. La chiave Gemini sta nel bundle e le chiamate partono dal
 * telefono: spegnerla nasconde il microfono e nient'altro, e chi
 * ripacchettizza l'APK lo riaccende. Sta qui perche' l'amministratore possa
 * già regalare l'AI a chi vuole, non perche' protegga qualcosa.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->boolean('ai_enabled')->default(true);
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('ai_enabled');
        });
    }
};
