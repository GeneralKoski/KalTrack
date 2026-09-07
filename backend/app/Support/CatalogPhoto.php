<?php

namespace App\Support;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * I file delle foto di catalogo.
 *
 * Stanno in `storage/app/private/catalog/` e NON sotto `images/{utente}/`
 * come le foto dei progressi: una foto di catalogo e' comune a tutti gli
 * iscritti, e il percorso per utente la renderebbe di uno solo. Fuori da
 * `public/` come tutto il resto, perche' si serve da `GET
 * /api/catalog/images/{name}` che sta sotto `auth:sanctum`.
 *
 * IL NOME E' UN UUID, e non il nome del file caricato. E' la stessa regola
 * del telefono: l'identita' di una foto e' il suo nome, quindi due immagini
 * diverse che collidono su un nome diventerebbero la stessa foto per tutti.
 * "panca.jpg" caricata due volte e' esattamente quel caso.
 *
 * L'ESTENSIONE VIENE DAL CONTENUTO, NON DAL CLIENT. `getClientOriginalExtension`
 * legge il nome che il client ha dichiarato, e la regola `mimes:` sull'upload
 * valida il contenuto ma non tocca quella stringa: un file immagine autentico
 * chiamato "x.php" passerebbe la validazione e finirebbe salvato come
 * "<uuid>.php". Il file non verrebbe mai eseguito - vive fuori da `public/` e
 * torna solo attraverso `CatalogController::image`, mai servito direttamente
 * dal webserver - ma un'estensione decisa dal client resta un'estensione di
 * cui non ci si puo' fidare. `extension()` la deriva invece dal mime type
 * rilevato leggendo i byte del file (`finfo`, lo stesso meccanismo dietro
 * `mimes:`), quindi coincide sempre con cio' che la validazione ha davvero
 * controllato.
 */
class CatalogPhoto
{
    /** Cinque megabyte, come `ImageController`. */
    public const MAX_KB = 5120;

    public const MIMES = 'jpg,jpeg,png,webp';

    /** Salva il file e torna il nome con cui si richiama. */
    public static function store(UploadedFile $file): string
    {
        $nome = Str::uuid().'.'.$file->extension();
        $file->storeAs('catalog', $nome, 'local');

        return $nome;
    }

    /**
     * Toglie un file, se c'e'.
     *
     * Va chiamata quando una riga smette di nominare una foto - sostituzione
     * o cancellazione della voce - o la cartella accumula file che nessuna
     * riga nomina piu'. Sul telefono ci pensa `collectOrphanPhotos`, qui e'
     * piu' semplice non crearli.
     */
    public static function forget(?string $nome): void
    {
        if ($nome === null || $nome === '') {
            return;
        }

        Storage::disk('local')->delete("catalog/{$nome}");
    }
}
