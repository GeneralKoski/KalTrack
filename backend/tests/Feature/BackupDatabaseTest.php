<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseMigrations;
use Tests\TestCase;

/**
 * Il backup del database.
 *
 * Vale la pena testarlo per una ragione sola: un backup che non si puo'
 * riaprire e' peggio di nessun backup, perche' ci si conta sopra.
 */
class BackupDatabaseTest extends TestCase
{
    /*
     * DatabaseMigrations e non RefreshDatabase: il secondo avvolge ogni test
     * in una transazione, e VACUUM non puo' girare dentro una transazione. In
     * produzione la transazione non c'e', quindi il comando funziona: era il
     * test a creare la condizione che il comando non incontrera' mai.
     */
    use DatabaseMigrations;

    private function backupDir(): string
    {
        return storage_path('backups');
    }

    protected function tearDown(): void
    {
        foreach (glob($this->backupDir().'/kaltrack-*.sqlite') ?: [] as $f) {
            unlink($f);
        }
        parent::tearDown();
    }

    public function test_produce_un_file_riapribile_con_i_dati_dentro(): void
    {
        User::create([
            'name' => 'Anna',
            'display_name' => 'Anna',
            'email' => 'anna@example.test',
            'password' => 'password123',
            'handle' => 'anna',
        ]);

        $this->artisan('backup:db')->assertSuccessful();

        $files = glob($this->backupDir().'/kaltrack-*.sqlite') ?: [];
        $this->assertCount(1, $files);

        // La prova che conta: il file si riapre e i dati ci sono davvero.
        $copy = new \PDO('sqlite:'.$files[0]);
        $handle = $copy->query('SELECT handle FROM users LIMIT 1')->fetchColumn();
        $this->assertSame('anna', $handle);
    }

    public function test_tiene_solo_gli_ultimi_backup(): void
    {
        // Tre file finti piu' vecchi, con date nel nome.
        if (! is_dir($this->backupDir())) {
            mkdir($this->backupDir(), 0750, true);
        }
        foreach (['2026-08-01-000000', '2026-08-02-000000', '2026-08-03-000000'] as $stamp) {
            touch($this->backupDir()."/kaltrack-{$stamp}.sqlite");
        }

        $this->artisan('backup:db --keep=2')->assertSuccessful();

        $files = glob($this->backupDir().'/kaltrack-*.sqlite') ?: [];
        $this->assertCount(2, $files);
        // Restano i piu' recenti: quello appena creato e il 3 agosto.
        $this->assertStringNotContainsString('2026-08-01', implode(' ', $files));
    }
}
