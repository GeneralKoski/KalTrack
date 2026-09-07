<?php

namespace App\Console\Commands;

use App\Models\EquipmentType;
use App\Models\Exercise;
use App\Models\Food;
use App\Models\MuscleGroup;
use App\Support\Text;
use Database\Seeders\TaxonomySeeder;
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
 *
 * CARICA ANCHE LE TASSONOMIE (`TaxonomySeeder`), e non per un problema suo:
 * `muscle_groups` e `equipment_types` sono a tutti gli effetti costanti
 * dell'app quanto gli esercizi e gli alimenti, e questo comando e' l'unico
 * che l'entrypoint del container lancia dopo le migrazioni. `DatabaseSeeder`
 * chiama anche lui `TaxonomySeeder`, ma crea pure uno "Test User" e per
 * questo non gira mai in produzione - le due tabelle restavano a zero righe
 * su ogni deploy reale, e ogni tendina del gestionale che le legge nasceva
 * vuota. Un comando solo, un lavoro solo, un posto solo che puo' fallire in
 * sicurezza (vedi `docker/entrypoint.sh`).
 */
class SeedCatalog extends Command
{
    protected $signature = 'catalog:seed';

    protected $description = 'Carica nel catalogo comune gli esercizi, gli alimenti e le tassonomie del seed dell\'app';

    public function handle(): int
    {
        $esercizi = $this->carica('exercises.json');
        $alimenti = $this->carica('foods.json');

        if ($esercizi === null || $alimenti === null) {
            return self::FAILURE;
        }

        $nuoviEsercizi = $this->seminaEsercizi($esercizi);
        $nuoviAlimenti = $this->seminaAlimenti($alimenti);
        [$nuoviGruppi, $nuoviAttrezzi] = $this->seminaTassonomie();

        $this->info("Esercizi aggiunti: {$nuoviEsercizi}");
        $this->info("Alimenti aggiunti: {$nuoviAlimenti}");
        $this->info("Gruppi muscolari aggiunti: {$nuoviGruppi}");
        $this->info("Attrezzi aggiunti: {$nuoviAttrezzi}");

        Log::info('[catalogo] seed applicato', [
            'esercizi' => $nuoviEsercizi,
            'alimenti' => $nuoviAlimenti,
            'gruppi_muscolari' => $nuoviGruppi,
            'attrezzi' => $nuoviAttrezzi,
        ]);

        return self::SUCCESS;
    }

    /** @return array<int, array<string, mixed>>|null */
    private function carica(string $nome): ?array
    {
        $percorso = database_path("seeders/data/{$nome}");

        if (! is_file($percorso)) {
            $this->error("Manca {$percorso}. Lancia `npm run seed:export` dall'app.");
            Log::error('[catalogo] file di seed mancante', ['percorso' => $percorso]);

            return null;
        }

        $dati = json_decode((string) file_get_contents($percorso), true);

        if (! is_array($dati)) {
            $this->error("{$nome} non e' un JSON valido.");
            Log::error('[catalogo] file di seed non e\' un JSON valido', ['percorso' => $percorso]);

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
        // Il vincolo unico del database e' su `name_norm`, non su `uid`: uno
        // scarto per solo `uid` lascia passare una voce di seed il cui nome
        // normalizzato collide con una riga creata nel frattempo - una
        // proposta approvata, o una voce scritta a mano dal gestionale - e
        // `create()` la respinge con una `QueryException` che questo comando
        // non gestisce. Il giro si ferma a meta' e l'entrypoint la inghiotte
        // in silenzio (`|| true` su `catalog:seed`), quindi il log e' l'unico
        // posto che lo direbbe.
        $presentiPerNome = Exercise::withTrashed()->pluck('name_norm')->flip();
        $nuovi = 0;

        foreach ($voci as $v) {
            if ($presenti->has($v['uid'])) {
                continue;
            }

            $norm = Text::normalize($v['name']);

            if ($presentiPerNome->has($norm)) {
                Log::warning('[catalogo] esercizio del seed saltato: nome gia\' in catalogo con un uid diverso', [
                    'uid' => $v['uid'],
                    'name' => $v['name'],
                ]);

                continue;
            }

            Exercise::create([
                'uid' => $v['uid'],
                'name' => $v['name'],
                'name_norm' => $norm,
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
            $presentiPerNome[$norm] = true;
            $nuovi++;
        }

        return $nuovi;
    }

    /** @param array<int, array<string, mixed>> $voci */
    private function seminaAlimenti(array $voci): int
    {
        $presenti = Food::withTrashed()->pluck('uid')->flip();
        // Stessa ragione di `seminaEsercizi`: il vincolo unico e' su
        // `name_norm`, non su `uid`.
        $presentiPerNome = Food::withTrashed()->pluck('name_norm')->flip();
        $nuovi = 0;

        foreach ($voci as $v) {
            if ($presenti->has($v['uid'])) {
                continue;
            }

            $norm = Text::normalize($v['name']);

            if ($presentiPerNome->has($norm)) {
                Log::warning('[catalogo] alimento del seed saltato: nome gia\' in catalogo con un uid diverso', [
                    'uid' => $v['uid'],
                    'name' => $v['name'],
                ]);

                continue;
            }

            Food::create([
                'uid' => $v['uid'],
                'name' => $v['name'],
                'name_norm' => $norm,
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
            $presentiPerNome[$norm] = true;
            $nuovi++;
        }

        return $nuovi;
    }

    /**
     * Le tassonomie, dallo stesso seeder che gira anche da `DatabaseSeeder`.
     *
     * @return array{int, int} gruppi muscolari aggiunti, attrezzi aggiunti
     */
    private function seminaTassonomie(): array
    {
        $primaGruppi = MuscleGroup::withTrashed()->count();
        $primaAttrezzi = EquipmentType::withTrashed()->count();

        (new TaxonomySeeder)->run();

        return [
            MuscleGroup::withTrashed()->count() - $primaGruppi,
            EquipmentType::withTrashed()->count() - $primaAttrezzi,
        ];
    }
}
