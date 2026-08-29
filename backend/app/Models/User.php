<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

#[Fillable([
    'name',
    'email',
    'password',
    'handle',
    'display_name',
    'avatar_url',
    'bio',
    'share_calories',
    'share_steps',
    'share_weight',
    'share_workouts',
])]
#[Hidden(['password', 'remember_token'])]
class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory, Notifiable;

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'share_calories' => 'boolean',
            'share_steps' => 'boolean',
            'share_weight' => 'boolean',
            'share_workouts' => 'boolean',
        ];
    }

    public function sharedStats(): HasMany
    {
        return $this->hasMany(SharedStat::class);
    }

    /**
     * Le amicizie ACCETTATE, da qualunque parte l'utente stia.
     *
     * Non e' una relazione Eloquent perche' la coppia e' ordinata: l'amico e'
     * il richiedente o il destinatario a seconda di chi ha chiesto, e nessuna
     * relazione standard esprime "l'altro dei due".
     *
     * @return \Illuminate\Support\Collection<int, User>
     */
    public function friends(): \Illuminate\Support\Collection
    {
        return Friendship::query()
            ->involving($this->id)
            ->accepted()
            ->with(['requester', 'addressee'])
            ->get()
            ->map(fn (Friendship $f) => $f->otherThan($this->id))
            ->filter()
            ->values();
    }

    /** Vero se i due sono amici accettati. L'ordine non conta. */
    public function isFriendWith(User $other): bool
    {
        if ($other->id === $this->id) {
            return true;
        }

        return Friendship::query()
            ->accepted()
            ->where(function ($q) use ($other) {
                $q->where(fn ($w) => $w
                    ->where('requester_id', $this->id)
                    ->where('addressee_id', $other->id))
                  ->orWhere(fn ($w) => $w
                    ->where('requester_id', $other->id)
                    ->where('addressee_id', $this->id));
            })
            ->exists();
    }
}
