<?php

namespace App\Http\Controllers\Api;

use App\Enums\FriendshipStatus;
use App\Http\Controllers\Controller;
use App\Http\Resources\FriendshipResource;
use App\Models\Friendship;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class FriendshipController extends Controller
{
    /** Amicizie e richieste, dal punto di vista di chi chiede. */
    public function index(Request $request): JsonResponse
    {
        $me = $request->user();
        $rows = Friendship::query()
            ->involving($me->id)
            ->with(['requester', 'addressee'])
            ->latest('id')
            ->get();

        return response()->json([
            'data' => $rows
                ->map(fn (Friendship $f) => (new FriendshipResource($f, $me->id))
                    ->toArray($request))
                ->all(),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'handle' => ['required', 'string', 'exists:users,handle'],
        ]);

        $me = $request->user();
        $other = User::where('handle', $data['handle'])->firstOrFail();

        if ($other->id === $me->id) {
            throw ValidationException::withMessages([
                'handle' => ['Non puoi aggiungere te stesso.'],
            ]);
        }

        // La richiesta esistente si cerca in ENTRAMBI i versi: se l'altro
        // aveva gia' chiesto a noi, questo tocco e' un'accettazione, non una
        // seconda richiesta che resterebbe in attesa per sempre.
        $existing = Friendship::query()
            ->where(function ($q) use ($me, $other) {
                $q->where(fn ($w) => $w
                    ->where('requester_id', $me->id)
                    ->where('addressee_id', $other->id))
                  ->orWhere(fn ($w) => $w
                    ->where('requester_id', $other->id)
                    ->where('addressee_id', $me->id));
            })
            ->first();

        if ($existing !== null) {
            if ($existing->status === FriendshipStatus::Accepted) {
                return response()->json(
                    (new FriendshipResource($existing, $me->id))->toArray($request)
                );
            }
            if ($existing->addressee_id === $me->id) {
                $existing->update([
                    'status' => FriendshipStatus::Accepted,
                    'responded_at' => now(),
                ]);
            }

            return response()->json(
                (new FriendshipResource($existing->fresh(), $me->id))->toArray($request)
            );
        }

        $friendship = Friendship::create([
            'requester_id' => $me->id,
            'addressee_id' => $other->id,
            'status' => FriendshipStatus::Pending,
        ]);

        return response()->json(
            (new FriendshipResource($friendship, $me->id))->toArray($request),
            201
        );
    }

    /**
     * Accetta. Solo il DESTINATARIO puo' farlo: chi ha chiesto non puo'
     * accettarsi da solo, che sarebbe un modo per entrare in casa d'altri.
     */
    public function accept(Request $request, Friendship $friendship): JsonResponse
    {
        $me = $request->user();
        abort_unless($friendship->addressee_id === $me->id, 403);

        $friendship->update([
            'status' => FriendshipStatus::Accepted,
            'responded_at' => now(),
        ]);

        return response()->json(
            (new FriendshipResource($friendship->fresh(), $me->id))->toArray($request)
        );
    }

    /**
     * Rifiuta una richiesta, o rimuove un'amicizia. Entrambe cancellano la
     * riga: uno stato "rifiutato" impedirebbe per sempre di richiedere, e
     * conserverebbe un dato che a nessuno dei due serve.
     */
    public function destroy(Request $request, Friendship $friendship): JsonResponse
    {
        $me = $request->user();
        abort_unless(
            $friendship->requester_id === $me->id
                || $friendship->addressee_id === $me->id,
            403
        );

        $friendship->delete();

        return response()->json(['ok' => true]);
    }
}
