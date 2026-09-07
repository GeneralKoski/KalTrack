<?php

namespace Database\Seeders;

use App\Models\EquipmentType;
use App\Models\MuscleGroup;
use Illuminate\Database\Seeder;

/**
 * I dodici gruppi e gli undici attrezzi che l'app conosce oggi.
 *
 * Le etichette sono copiate da `gym.muscle.*` e `gym.equipment.*` di
 * `src/i18n/locales/it.json` e `en.json`: sono le stesse parole che l'utente
 * vede gia', e cambiarle qui sarebbe un cambio di prodotto travestito da
 * migrazione.
 *
 * Idempotente per slug: gira a ogni deploy senza duplicare niente e senza
 * riscrivere un'etichetta che l'amministratore ha corretto dal gestionale.
 */
class TaxonomySeeder extends Seeder
{
    /** slug => [it, en, ordine] */
    private const MUSCLE_GROUPS = [
        'petto' => ['Petto', 'Chest', 10],
        'schiena' => ['Schiena', 'Back', 20],
        'spalle' => ['Spalle', 'Shoulders', 30],
        'bicipiti' => ['Bicipiti', 'Biceps', 40],
        'tricipiti' => ['Tricipiti', 'Triceps', 50],
        'avambracci' => ['Avambracci', 'Forearms', 60],
        'addome' => ['Addome', 'Abs', 70],
        'quadricipiti' => ['Quadricipiti', 'Quads', 80],
        'femorali' => ['Femorali', 'Hamstrings', 90],
        'glutei' => ['Glutei', 'Glutes', 100],
        'polpacci' => ['Polpacci', 'Calves', 110],
        'full_body' => ['Full body', 'Full body', 120],
    ];

    private const EQUIPMENT = [
        'corpo_libero' => ['Corpo libero', 'Bodyweight', 10],
        'bilanciere' => ['Bilanciere', 'Barbell', 20],
        'manubri' => ['Manubri', 'Dumbbells', 30],
        'kettlebell' => ['Kettlebell', 'Kettlebell', 40],
        'cavi' => ['Cavi', 'Cables', 50],
        'macchina' => ['Macchina', 'Machine', 60],
        'panca' => ['Panca', 'Bench', 70],
        'sbarra' => ['Sbarra', 'Pull-up bar', 80],
        'elastici' => ['Elastici', 'Resistance bands', 90],
        'trx' => ['TRX', 'TRX', 100],
        'cardio' => ['Cardio', 'Cardio', 110],
    ];

    public function run(): void
    {
        foreach (self::MUSCLE_GROUPS as $slug => [$it, $en, $sort]) {
            MuscleGroup::firstOrCreate(
                ['slug' => $slug],
                ['label_it' => $it, 'label_en' => $en, 'sort' => $sort],
            );
        }

        foreach (self::EQUIPMENT as $slug => [$it, $en, $sort]) {
            EquipmentType::firstOrCreate(
                ['slug' => $slug],
                ['label_it' => $it, 'label_en' => $en, 'sort' => $sort],
            );
        }
    }
}
