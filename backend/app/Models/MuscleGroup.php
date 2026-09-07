<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * Un gruppo muscolare del catalogo.
 *
 * `slug` non e' modificabile dopo la creazione, e il divieto sta nel
 * controller che lo scrive: e' la chiave che gli esercizi hanno in colonna.
 */
#[Fillable(['slug', 'label_it', 'label_en', 'sort'])]
class MuscleGroup extends Model
{
    use SoftDeletes;
}
