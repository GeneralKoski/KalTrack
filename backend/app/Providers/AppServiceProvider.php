<?php

namespace App\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        /*
         * Cambiare l'email chiede la password attuale, e quella risposta - 422
         * o 200 - dice a chi ha un token rubato se la password e' giusta:
         * senza limite la si indovina a forza bruta. Conta solo le richieste
         * che portano `email`: gli interruttori di condivisione passano dalla
         * stessa rotta, uno per tocco, e non c'entrano.
         */
        RateLimiter::for('email-change', fn (Request $request) => $request->has('email')
            ? Limit::perMinute(5)->by((string) $request->user()?->id)
            : Limit::none());
    }
}
