<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Il profilo pubblico e le preferenze di condivisione.
 *
 * Le preferenze stanno sull'utente e non su una tabella a parte perche' sono
 * una per utente e si leggono a ogni visita del profilo: separarle sarebbe una
 * join in piu' su ogni richiesta senza nessun guadagno.
 *
 * Tutte partono da FALSE. Un profilo appena creato non condivide niente: chi
 * si iscrive deve scegliere cosa mostrare, non scoprire cosa stava gia'
 * mostrando.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            // L'identificativo pubblico con cui gli amici si cercano. Nullable
            // perche' un account puo' esistere prima di averlo scelto.
            $table->string('handle', 30)->nullable()->unique()->after('id');
            $table->string('display_name', 60)->nullable()->after('name');
            $table->string('avatar_url')->nullable()->after('display_name');
            $table->string('bio', 160)->nullable()->after('avatar_url');

            $table->boolean('share_calories')->default(false);
            $table->boolean('share_steps')->default(false);
            $table->boolean('share_weight')->default(false);
            $table->boolean('share_workouts')->default(false);
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn([
                'handle',
                'display_name',
                'avatar_url',
                'bio',
                'share_calories',
                'share_steps',
                'share_weight',
                'share_workouts',
            ]);
        });
    }
};
