<?php

namespace App\Models;

use App\Enums\FriendshipStatus;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable(['requester_id', 'addressee_id', 'status', 'responded_at'])]
class Friendship extends Model
{
    protected function casts(): array
    {
        return [
            'status' => FriendshipStatus::class,
            'responded_at' => 'datetime',
        ];
    }

    public function requester(): BelongsTo
    {
        return $this->belongsTo(User::class, 'requester_id');
    }

    public function addressee(): BelongsTo
    {
        return $this->belongsTo(User::class, 'addressee_id');
    }

    /** Le righe che coinvolgono l'utente, da qualunque parte stia. */
    public function scopeInvolving(Builder $query, int $userId): Builder
    {
        return $query->where(function (Builder $q) use ($userId) {
            $q->where('requester_id', $userId)->orWhere('addressee_id', $userId);
        });
    }

    public function scopeAccepted(Builder $query): Builder
    {
        return $query->where('status', FriendshipStatus::Accepted);
    }

    /** L'altra persona rispetto a chi guarda. */
    public function otherThan(int $userId): ?User
    {
        return $this->requester_id === $userId
            ? $this->addressee
            : $this->requester;
    }
}
