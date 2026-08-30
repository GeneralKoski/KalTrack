<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\LoginRequest;
use App\Http\Requests\RegisterRequest;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

/**
 * L'account, che nell'app e' facoltativo.
 *
 * KalTrack funziona senza: il diario, la palestra e tutto il resto vivono sul
 * telefono e non hanno bisogno di nessun server. L'account serve solo a chi
 * vuole gli amici, e non porta con se' il diario: al server arrivano soltanto
 * i totali di giornata che l'utente sceglie di condividere.
 */
class AuthController extends Controller
{
    public function register(RegisterRequest $request): JsonResponse
    {
        $data = $request->validated();

        $user = User::create([
            'name' => $data['displayName'],
            'display_name' => $data['displayName'],
            'email' => $data['email'],
            'password' => $data['password'],
            'handle' => $data['handle'],
        ]);

        return response()->json([
            'token' => $user->createToken('mobile')->plainTextToken,
            'handle' => $user->handle,
        ], 201);
    }

    public function login(LoginRequest $request): JsonResponse
    {
        $data = $request->validated();

        /*
         * Email oppure nome utente, con lo stesso campo.
         *
         * Il confronto sull'handle e' case-insensitive: un nome utente e'
         * qualcosa che si scrive a mano su una tastiera del telefono, che
         * mette la maiuscola per conto suo. Rifiutare "GeneralKoski" a chi si
         * e' registrato come "generalkoski" sarebbe stato un errore
         * incomprensibile.
         */
        $login = $data['login'];
        $user = User::query()
            ->where('email', $login)
            ->orWhere(fn ($q) => $q->whereHandle($login))
            ->first();

        // Un messaggio solo per credenziali sbagliate e utente inesistente:
        // distinguerli direbbe a chiunque quali email e quali nomi utente sono
        // registrati.
        if (! $user || ! Hash::check($data['password'], $user->password)) {
            throw ValidationException::withMessages([
                'login' => ['Credenziali non corrette.'],
            ]);
        }

        return response()->json([
            'token' => $user->createToken('mobile')->plainTextToken,
            'handle' => $user->handle,
        ]);
    }

    /** Revoca il solo token in uso: gli altri dispositivi restano collegati. */
    public function logout(Request $request): JsonResponse
    {
        $request->user()->currentAccessToken()->delete();

        return response()->json(['ok' => true]);
    }
}
