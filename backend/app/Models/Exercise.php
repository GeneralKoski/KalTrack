<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;

/**
 * Una voce del catalogo comune.
 *
 * `created_by` c'e' ma non esce mai da nessuna risposta: serve a decidere chi
 * puo' correggere una voce, non a dire agli altri chi l'ha scritta.
 */
#[Fillable(['name', 'name_norm', 'muscle_group', 'equipment', 'created_by'])]
class Exercise extends Model {}
