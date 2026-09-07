<?php

namespace App\Console\Commands;

use App\Models\Exercise;
use App\Models\Food;
use App\Support\Text;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;

/**
 * Carica nel catalogo del server il seed che l'app si porta dietro.
 *
 * SENZA QUESTO COMANDO IL PRIMO PULL DUPLICA DUECENTO ESERCIZI SU OGNI
 * TELEFONO. Il seed li ha inseriti in locale con i suoi id, il catalogo del
 * server non li conosce, e il confronto per `uid` non troverebbe niente: al
 * telefono arriverebbero come voci nuove da aggiungere accanto a quelle che
 * ha gia'.
 *
 * Legge i due JSON di `database/seeders/data/` e non `src/db/seed/`: in
 * produzione `backend/` viene rsyncata da sola, e quella cartella li' non
 * esiste. I due file si rigenerano dall'app con `npm run seed:export`.
 *
 * IDEMPOTENTE PER `uid`, e in un senso preciso: inserisce cio' che manca e non
 * tocca cio' che c'e'. Una voce che l'amministratore ha corretto dal
 * gestionale resta corretta, e una che ha cancellato resta cancellata - il
 * soft delete la tiene in tabella, quindi il comando la ritrova e la salta.
 * E' la stessa regola di `applyExerciseSeeds` sul telefono, e per lo stesso
 * motivo: chi decide vince sul seed.
 */
class SeedCatalog extends Command
{
    protected $signature = 'catalog:seed';

    protected $description = 'Carica nel catalogo comune gli esercizi e gli alimenti del seed dell\'app';

    public function handle(): int
    {
        $esercizi = $this->carica('exercises.json');
        $alimenti = $this->carica('foods.json');

        if ($esercizi === null || $alimenti === null) {
            return self::FAILURE;
        }

        $nuoviEsercizi = $this->seminaEsercizi($esercizi);
        $nuoviAlimenti = $this->seminaAlimenti($alimenti);

        $this->info("Esercizi aggiunti: {$nuoviEsercizi}");
        $this->info("Alimenti aggiunti: {$nuoviAlimenti}");

        Log::info('[catalogo] seed applicato', [
            'esercizi' => $nuoviEsercizi,
            'alimenti' => $nuoviAlimenti,
        ]);

        return self::SUCCESS;
    }

    /** @return array<int, array<string, mixed>>|null */
    private function carica(string $nome): ?array
    {
        $percorso = database_path("seeders/data/{$nome}");

        if (! is_file($percorso)) {
            $this->error("Manca {$percorso}. Lancia `npm run seed:export` dall'app.");

            return null;
        }

        $dati = json_decode((string) file_get_contents($percorso), true);

        if (! is_array($dati)) {
            $this->error("{$nome} non e' un JSON valido.");

            return null;
        }

        return $dati;
    }

    /** @param array<int, array<string, mixed>> $voci */
    private function seminaEsercizi(array $voci): int
    {
        // Un solo giro sul database invece di duecento SELECT: il comando gira
        // all'avvio del container, e duecento andate e ritorni su un file
        // SQLite montato su volume si sentono.
        $presenti = Exercise::withTrashed()->pluck('uid')->flip();
        $nuovi = 0;

        foreach ($voci as $v) {
            if ($presenti->has($v['uid'])) {
                continue;
            }

            Exercise::create([
                'uid' => $v['uid'],
                'name' => $v['name'],
                'name_norm' => Text::normalize($v['name']),
                'muscle_group' => $v['muscleGroup'],
                'secondary_muscles' => implode(',', $v['secondaryMuscles'] ?? []) ?: null,
                'equipment' => implode(',', $v['equipment'] ?? []) ?: null,
                'instructions' => $v['instructions'] ?? null,
                'status' => 'published',
                // Il seed non e' di nessuno: `created_by` nullo vuol dire che
                // nessun utente puo' correggerlo dall'app, e va bene cosi' -
                // si corregge dal gestionale.
                'created_by' => null,
            ]);
            $nuovi++;
        }

        return $nuovi;
    }

    /** @param array<int, array<string, mixed>> $voci */
    private function seminaAlimenti(array $voci): int
    {
        $presenti = Food::withTrashed()->pluck('uid')->flip();
        $nuovi = 0;

        foreach ($voci as $v) {
            if ($presenti->has($v['uid'])) {
                continue;
            }

            Food::create([
                'uid' => $v['uid'],
                'name' => $v['name'],
                'name_norm' => Text::normalize($v['name']),
                'kcal' => $v['kcal'],
                'protein' => $v['protein'],
                'carbs' => $v['carbs'],
                'sugars' => $v['sugars'],
                'fat' => $v['fat'],
                'saturated_fat' => $v['saturatedFat'],
                'fiber' => $v['fiber'],
                'salt' => $v['salt'],
                'is_liquid' => $v['isLiquid'],
                'default_serving_g' => $v['defaultServingG'],
                'serving_label' => $v['servingLabel'],
                'status' => 'published',
                'created_by' => null,
            ]);
            $nuovi++;
        }

        return $nuovi;
    }
}
