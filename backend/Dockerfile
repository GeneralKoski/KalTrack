# Immagine unica: PHP-FPM piu' nginx nello stesso container.
#
# Due container separati sarebbero piu' ortodossi, ma questo backend serve
# poche persone e un socket unix in un solo container e' una parte in meno che
# puo' rompersi. Le altre app sul server seguono lo stesso spirito.
FROM php:8.4-fpm-alpine

RUN apk add --no-cache nginx supervisor sqlite-libs \
    && docker-php-ext-install pdo_mysql opcache \
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
