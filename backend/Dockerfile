# Stadio a parte per gli asset del pannello (Vite/React).
#
# `admin.blade.php` chiama `@vite(['resources/js/admin/main.tsx'])`, e senza
# questo stadio `public/build` non esiste in un'immagine costruita da zero -
# e' gitignored, e prima di questo stadio nessun passo del container lo
# produceva. Un `FROM node` a se' e non `npm` dentro l'immagine PHP: sono due
# stadi diversi, quindi un cambio di `package.json` non invalida mai la
# cache di `composer install` qui sotto, e viceversa un cambio di
# `composer.lock` non fa ricostruire gli asset.
FROM node:22-alpine AS assets

WORKDIR /app

# Stessa idea del layer di composer sotto: prima solo cio' che serve a
# installare, cosi' un cambio di codice non invalida la cache di `npm ci`.
COPY package.json package-lock.json ./
RUN npm ci

COPY vite.config.js ./
COPY resources ./resources
RUN npm run build

# Immagine unica: PHP-FPM piu' nginx nello stesso container.
#
# Due container separati sarebbero piu' ortodossi, ma questo backend serve
# poche persone e un socket unix in un solo container e' una parte in meno che
# puo' rompersi. Le altre app sul server seguono lo stesso spirito.
FROM php:8.4-fpm-alpine

RUN apk add --no-cache nginx supervisor sqlite-libs \
    && docker-php-ext-install pdo_mysql opcache \
    # nginx gira come www-data, ma i suoi percorsi temporanei nascono di
    # proprieta' dell'utente `nginx` di Alpine. Una richiesta con un corpo piu'
    # grande del buffer viene scritta su disco, e senza questo fallisce con
    # "Permission denied" e un 500: le GET passano, le POST grandi no.
    && mkdir -p /var/lib/nginx/tmp /var/lib/nginx/logs /run/nginx \
    && chown -R www-data:www-data /var/lib/nginx /run/nginx \
    && rm -rf /var/cache/apk/*

# Composer arriva dalla sua immagine ufficiale: nessuna installazione a mano
# da tenere aggiornata.
COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

WORKDIR /var/www/html

# Prima solo i file delle dipendenze: cosi' un cambio di codice non invalida
# la cache di composer e il rebuild resta veloce.
COPY composer.json composer.lock ./
RUN composer install \
    --no-dev \
    --no-scripts \
    --no-autoloader \
    --prefer-dist \
    --no-interaction

COPY . .

# Gli asset costruiti dallo stadio Node, DOPO `COPY . .`: `public/build` e'
# gitignored e assente dal contesto di build, quindi non c'e' niente da
# sovrascrivere, ma l'ordine resta esplicito - il codice sorgente PHP arriva
# per primo, gli asset gia' compilati per ultimi.
COPY --from=assets /app/public/build ./public/build

RUN composer dump-autoload --optimize --no-dev \
    && mkdir -p storage/framework/{cache,sessions,views} storage/logs database \
    && chown -R www-data:www-data storage bootstrap/cache database

COPY docker/nginx.conf /etc/nginx/nginx.conf
COPY docker/supervisord.conf /etc/supervisord.conf
COPY docker/entrypoint.sh /usr/local/bin/entrypoint
RUN chmod +x /usr/local/bin/entrypoint

EXPOSE 80
ENTRYPOINT ["/usr/local/bin/entrypoint"]
CMD ["supervisord", "-c", "/etc/supervisord.conf"]
