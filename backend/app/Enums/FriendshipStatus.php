<?php

namespace App\Enums;

/**
 * Lo stato di una richiesta di amicizia.
 *
 * Il rifiuto non c'e': rifiutare cancella la riga. Uno stato "rejected"
 * bloccherebbe una nuova richiesta per sempre e conserverebbe un dato che a
 * nessuno dei due serve.
 */
enum FriendshipStatus: string
{
    case Pending = 'pending';
    case Accepted = 'accepted';
}
