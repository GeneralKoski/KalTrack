<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Il catalogo degli esercizi, comune a tutti gli iscritti.
 *
 * E' L'UNICA TABELLA DI QUESTO SERVER CHE ESCE VERSO CHI NON E' AMICO, ed e'
 * una scelta: un esercizio che qualcuno si e' creato entra nell'elenco di
 * chiunque, cosi' il catalogo cresce invece di restare quello del primo
 * giorno. Tutto il resto - totali, palestra, profilo - passa dalle due regole
 * della privacy, questo no.
 *
 * NON C'E' NESSUNA COLONNA CHE DICA CHI HA AGGIUNTO COSA, e non e' una
 * dimenticanza: sapere che un esercizio l'ha inventato Tizio e' un fatto su
 * Tizio, e non serve a nessuno per allenarsi. Quel che non si registra non
 * puo' sfuggire da nessun endpoint scritto domani.
 *
 * Quel che manca rispetto alla tabella del telefono manca apposta: niente
 * `notes`, niente `instructions`, niente `dislike_level`, niente
 * `usage_count`. Sono giudizi personali su un esercizio, non la sua
 * descrizione, e non hanno motivo di stare nel catalogo di tutti.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('exercises', function (Blueprint $table) {
            $table->id();
            $table->string('name', 120);
            // La chiave della deduplica: minuscolo, senza accenti, spazi
            // compressi. Unica, cosi' il doppione lo impedisce il database e
            // non solo il controller.
            $table->string('name_norm', 120)->unique();
            $table->string('muscle_group', 40);
            // Elenco separato da virgole ("bilanciere,panca"): gli attrezzi
            // sono un insieme chiuso e corto, e una tabella di appoggio per
            // due parole per riga sarebbe una join in piu' su ogni ricerca.
            $table->string('equipment', 120)->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('exercises');
    }
};
