<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * I byte delle foto, che la sincronizzazione da sola non porta.
 *
 * `sync_records` copia le RIGHE, e una riga con una foto contiene il percorso
 * di un file: sull'altro telefono quel percorso non ha niente dietro, e
 * l'immagine e' rotta senza che nessuno dica perche'. Serviva un posto dove
 * mettere anche i file.
 *
 * L'identita' di un'immagine e' il suo NOME, non il percorso: e' l'unica parte
 * che i due dispositivi possono condividere, visto che la cartella dell'app
 * cambia da sistema a sistema. Il nome lo genera il telefono ed e' un UUID.
 *
 * Le foto stanno in `storage/app/private/images/{utente}` - dentro il volume
 * Docker che sopravvive al container, e MAI in `public/`: sono le foto dei
 * progressi di qualcuno, non devono essere raggiungibili con un URL
 * indovinato.
 */
class ImageController extends Controller
{
    /** Cinque megabyte a foto: una foto di telefono ci sta comoda. */
    private const MAX_KB = 5120;

    /**
     * Un nome accettabile.
     *
     * Non e' pignoleria: il nome finisce in un percorso su disco, e senza
     * questo controllo un `../` ci farebbe scrivere dove non dobbiamo.
     */
    private const NAME = '/^[A-Za-z0-9._-]{1,120}$/';

    /** Cosa c'e' gia', cosi' il telefono manda solo quel che manca. */
    public function index(Request $request): JsonResponse
    {
        return response()->json(['names' => $this->names($request->user()->id)]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'regex:'.self::NAME],
            'file' => ['required', 'file', 'max:'.self::MAX_KB],
        ]);

        $request->file('file')->storeAs(
            $this->dir($request->user()->id),
            $data['name'],
            'local'
        );

        return response()->json(['name' => $data['name']], 201);
    }

    public function show(Request $request, string $name): StreamedResponse
    {
        abort_unless(preg_match(self::NAME, $name) === 1, 404);

        $path = $this->dir($request->user()->id).'/'.$name;
        abort_unless(Storage::disk('local')->exists($path), 404);

        return Storage::disk('local')->download($path);
    }

    public function destroy(Request $request, string $name): JsonResponse
    {
        abort_unless(preg_match(self::NAME, $name) === 1, 404);

        Storage::disk('local')->delete($this->dir($request->user()->id).'/'.$name);

        return response()->json(['deleted' => $name]);
    }

    /** @return array<int, string> */
    private function names(int $userId): array
    {
        return array_map(
            fn (string $path) => basename($path),
            Storage::disk('local')->files($this->dir($userId))
        );
    }

    private function dir(int $userId): string
    {
        return "images/{$userId}";
    }
}
