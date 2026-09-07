<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

/**
 * Le stesse sei colonne di moderazione degli esercizi, per lo stesso motivo,
 * piu' tre che riguardano solo gli alimenti.
 *
 * `barcode` e' identita' esatta: due prodotti con lo stesso codice sono lo
 * stesso prodotto, e il telefono ce l'ha dalla scansione da quando esiste
 * `FoodScanScreen`. Il server non lo aveva, quindi due telefoni che scansivano
 * lo stesso prodotto proponevano due voci che solo il nome poteva unire - e i
 * nomi di OpenFoodFacts non combaciano mai del tutto.
 *
 * `off_id` dice che i valori vengono da un archivio compilato da chiunque. In
 * revisione e' l'informazione che serve per decidere se fidarsi.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('foods', function (Blueprint $table) {
            $table->string('uid', 64)->nullable()->after('id');
            $table->string('status', 12)->default('published')->after('serving_label');
            $table->string('barcode', 32)->nullable()->after('brand');
            $table->string('off_id', 64)->nullable()->after('barcode');
            $table->string('image', 120)->nullable()->after('off_id');
            $table->timestamp('reviewed_at')->nullable();
            $table->foreignId('reviewed_by')
                ->nullable()
                ->constrained('users')
                ->nullOnDelete();
            $table->string('review_note', 500)->nullable();
            $table->softDeletes();
        });

        DB::table('foods')->update(['status' => 'published']);

        foreach (DB::table('foods')->whereNull('uid')->pluck('id') as $id) {
            DB::table('foods')->where('id', $id)->update(['uid' => (string) Str::uuid()]);
        }

        Schema::table('foods', function (Blueprint $table) {
            $table->unique('uid');
            $table->index('status');
            // Non unique: lo stesso codice puo' arrivare due volte prima che
            // qualcuno decida quale delle due voci tenere, e un vincolo del
            // database farebbe fallire una proposta invece di metterla in coda.
            $table->index('barcode');
        });
    }

    public function down(): void
    {
        Schema::table('foods', function (Blueprint $table) {
            $table->dropUnique(['uid']);
            $table->dropIndex(['status']);
            $table->dropIndex(['barcode']);
            $table->dropConstrainedForeignId('reviewed_by');
            $table->dropColumn([
                'uid',
                'status',
                'barcode',
                'off_id',
                'image',
                'reviewed_at',
                'review_note',
                'deleted_at',
            ]);
        });
    }
};
