<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Copia il database in un file datato.
 *
 * Usa `VACUUM INTO` e non `cp`: SQLite scrive in piu' passaggi, e copiare il
 * file mentre una scrittura e' a meta' produce un backup che sembra valido e
 * non lo e'. `VACUUM INTO` prende un lock, scrive una copia coerente e la
 * compatta, tutto dentro il motore.
 *
 * Il backup e' l'unica difesa contro la perdita dei dati: qui non ci sono
 * repliche, e il file vive su un solo disco.
 */
class BackupDatabase extends Command
{
    protected $signature = 'backup:db {--keep=14 : Quanti backup conservare}';

    protected $description = 'Copia il database SQLite in un file datato';

    public function handle(): int
    {
        $connection = config('database.default');
        if ($connection !== 'sqlite') {
            $this->error("backup:db vale solo per SQLite, non per [{$connection}].");

            return self::FAILURE;
        }

        $dir = storage_path('backups');
        if (! is_dir($dir) && ! mkdir($dir, 0750, true) && ! is_dir($dir)) {
            $this->error("Non riesco a creare {$dir}.");

            return self::FAILURE;
        }

        $target = $dir.'/kaltrack-'.now()->format('Y-m-d-His').'.sqlite';

        try {
            // Il percorso non arriva mai da input esterno: e' config, e
            // VACUUM INTO non accetta parametri legati.
            DB::statement("VACUUM INTO '".str_replace("'", "''", $target)."'");
        } catch (\Throwable $e) {
            Log::error('[backup] copia non riuscita', ['exception' => $e]);
            $this->error('Backup non riuscito: '.$e->getMessage());

            return self::FAILURE;
        }

        @chmod($target, 0600);
        $size = filesize($target) ?: 0;
        $this->info(sprintf('Backup: %s (%.1f KB)', basename($target), $size / 1024));

        $this->rotate($dir, (int) $this->option('keep'));

        return self::SUCCESS;
    }

    /**
     * Tiene gli ultimi `keep` backup.
     *
     * Senza rotazione il disco si riempie in silenzio, ed e' il modo piu'
     * banale per far fallire proprio il backup che serviva.
     */
    private function rotate(string $dir, int $keep): void
    {
        if ($keep < 1) {
            return;
        }

        $files = glob($dir.'/kaltrack-*.sqlite') ?: [];
        // Per nome e non per mtime: il nome porta la data ed e' stabile anche
        // se un file viene toccato per sbaglio.
        rsort($files);

        foreach (array_slice($files, $keep) as $old) {
            unlink($old);
            $this->line('Rimosso il backup vecchio: '.basename($old));
        }
    }
}
