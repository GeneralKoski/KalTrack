<?php

namespace Tests\Unit;

use App\Support\ValidationMessage;
use Illuminate\Support\Facades\App;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class ValidationMessageTest extends TestCase
{
    public function test_un_solo_campo_in_errore_ritorna_il_suo_messaggio(): void
    {
        $message = ValidationMessage::summarize([
            'login' => ['Credenziali non corrette.'],
        ]);

        $this->assertSame('Credenziali non corrette.', $message);
    }

    #[DataProvider('locales')]
    public function test_piu_campi_con_lo_stesso_messaggio_generico_lo_mostrano_una_volta(string $locale): void
    {
        App::setLocale($locale);
        $generic = trans('validation.required');

        $message = ValidationMessage::summarize([
            'handle' => [$generic],
            'email' => [$generic],
            'password' => [$generic],
        ]);

        $this->assertSame($generic, $message);
    }

    #[DataProvider('locales')]
    public function test_un_messaggio_piu_preciso_vince_sul_generico(string $locale): void
    {
        App::setLocale($locale);
        $generic = trans('validation.required');

        $message = ValidationMessage::summarize([
            'handle' => [$generic],
            'password' => ['La password inserita non è sicura.'],
        ]);

        $this->assertSame('La password inserita non è sicura.', $message);
    }

    /** @return array<string, array{string}> */
    public static function locales(): array
    {
        return [
            'italiano' => ['it'],
            'inglese' => ['en'],
        ];
    }
}
