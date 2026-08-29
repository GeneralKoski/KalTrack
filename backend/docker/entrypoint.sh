#!/bin/sh
set -e

# Il database sta su un volume: al primo avvio il file non esiste e va creato
# prima che Laravel provi ad aprirlo.
if [ ! -f /data/database.sqlite ]; then
  touch /data/database.sqlite
  echo "[entrypoint] creato /data/database.sqlite"
fi
chown -R www-data:www-data /data /var/www/html/storage

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
