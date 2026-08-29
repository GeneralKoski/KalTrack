#!/bin/sh
set -e

# Il database sta su un volume: al primo avvio il file non esiste e va creato
# prima che Laravel provi ad aprirlo.
if [ ! -f /var/www/html/database/database.sqlite ]; then
  touch /var/www/html/database/database.sqlite
  echo "[entrypoint] creato database.sqlite"
fi
chown -R www-data:www-data /var/www/html/database /var/www/html/storage

# Le migrazioni girano a ogni avvio: sono idempotenti, e un container che
# riparte dopo un aggiornamento deve trovare lo schema aggiornato senza che
# nessuno si ricordi di lanciarle a mano.
php artisan migrate --force --no-interaction

# La cache si ricostruisce qui e non nell'immagine: dipende da .env, che
# arriva a runtime. Costruirla al build significherebbe cristallizzare la
# configurazione di chi ha fatto il build.
php artisan config:cache
php artisan route:cache

exec "$@"
