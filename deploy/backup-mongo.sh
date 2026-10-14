#!/bin/sh
# Daily database + uploads backup for the self-hosted setup. Add to cron:
#   0 2 * * * /opt/ahcl360/deploy/backup-mongo.sh >> /var/log/ahcl-backup.log 2>&1
set -e
cd "$(dirname "$0")"
STAMP=$(date +%Y%m%d-%H%M)
mkdir -p backups
docker compose -f docker-compose.prod.yml exec -T mongo mongodump --archive --gzip --db ahcl360 > "backups/db-$STAMP.gz"
docker compose -f docker-compose.prod.yml exec -T app tar czf - -C /data uploads > "backups/uploads-$STAMP.tgz"
# keep 14 days
find backups -type f -mtime +14 -delete
echo "backup $STAMP done"
