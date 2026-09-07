<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * Un attrezzo del catalogo.
 *
 * Il model si chiama `EquipmentType` e non `Equipment` perche' "equipment" e'
 * gia' plurale in inglese: Eloquent cercherebbe la tabella `equipment`, ed e'
 * lo stesso inciampo che `Food` risolve con `$table`. Qui si risolve col nome,
 * che e' anche piu' onesto - una riga e' un tipo di attrezzo, non un attrezzo.
 */
#[Fillable(['slug', 'label_it', 'label_en', 'sort'])]
class EquipmentType extends Model
{
    use SoftDeletes;
}
