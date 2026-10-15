#!/usr/bin/env bash
# Installation initiale de CSnake sur le VPS (à lancer une seule fois, depuis le poste local).
# Tout est isolé dans /opt/csnake + deux vhosts Apache dédiés ; aucun autre site n'est modifié.
set -euo pipefail
HOST="${CSNAKE_HOST:-deploy@57.129.171.147}"
DOMAIN=csnake.kma.studio
cd "$(dirname "$0")"

ssh "$HOST" "sudo mkdir -p /opt/csnake/app /opt/csnake/data /var/www/csnake \
  && sudo chown -R deploy:deploy /opt/csnake/app /opt/csnake \
  && sudo chown 1000:1000 /opt/csnake/data"
scp apache/csnake.conf apache/csnake-ssl.conf "$HOST:/tmp/"
ssh "$HOST" "sudo mv /tmp/csnake.conf /tmp/csnake-ssl.conf /etc/apache2/sites-available/ \
  && sudo a2ensite csnake.conf >/dev/null && sudo apache2ctl configtest && sudo systemctl reload apache2"

./deploy.sh

ssh "$HOST" "sudo certbot certonly --webroot -w /var/www/csnake -d $DOMAIN --non-interactive --agree-tos --keep-until-expiring \
  && sudo a2ensite csnake-ssl.conf >/dev/null && sudo apache2ctl configtest && sudo systemctl reload apache2"
echo "https://$DOMAIN est prêt."
