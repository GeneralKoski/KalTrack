<?php

namespace App\Http\Resources;

use App\Models\Friendship;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Una riga di amicizia dal punto di vista di CHI GUARDA.
 *
 * `direction` esiste perche' la stessa riga significa cose diverse per i due:
 * per chi ha chiesto e' "in attesa di risposta", per l'altro e' "ti ha
 * chiesto l'amicizia". Senza, la schermata non saprebbe quale bottone offrire.
 *
 * @property Friendship $resource
 */
class FriendshipResource extends JsonResource
{
    public function __construct($resource, private readonly int $viewerId)
    {
        parent::__construct($resource);
    }

    public function toArray(Request $request): array
    {
        $friendship = $this->resource;
        $other = $friendship->otherThan($this->viewerId);

        return [
            'id' => $friendship->id,
            'status' => $friendship->status->value,
            'direction' => $friendship->requester_id === $this->viewerId
                ? 'outgoing'
                : 'incoming',
            'user' => $other === null ? null : [
                'handle' => $other->handle,
                'displayName' => $other->display_name ?? $other->name,
                'avatarUrl' => $other->avatar_url,
            ],
        ];
    }
}
