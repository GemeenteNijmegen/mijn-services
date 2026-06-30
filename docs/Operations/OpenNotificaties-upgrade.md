# Upgrade open-notificaties

Huidige versie: 1.8.0
Latest versie: 1.16.0

## Changelog doornemen
- 1.8.1 - The unique constraint is added for (Filter.filter_group, Filter.key). If “datamodel.0017” migration is failing, remove duplicate entries manually from the Filter model and try to run it again.
- 1.8.2 - SITE_DOMAIN env var is toegevoegd  (dit moet ook in de code gebeuren).
- 1.10.0 - Django version requires postgres 14, wij hebben 17.5
- 1.12.0 - This version of Open Notificaties increases the default values of the notification retry parameters, leading to tasks that are scheduled further in the future. In order for this to work correctly, it is required to increase the consumer_timeout in RabbitMQ.
- 1.14.0 - OTEL_SDK_DISABLED=true moet toegevoegd worden

## Stap 0 - Voorbereiding
- Zorg dat de OTEL uit staat (env vars.)
- Zorg dat de container voor de main service groot genoeg is (op dev ging het pas goed met een container van 0.5 vcpu en 1gb mem)
- Zorg dat de timeouts voor health checks 2,5minuten zijn minstends (container health check en ALB health check graceperiod)

## Stap 0.1 - RabbitMQ upgrade
- Zorgen dat RABBITMQ_ERLANG_COOKIE geset is en we een health check kunnen gebruiken


## Stap 1 - DB migratie
- Checken of de additional database resource lambda ooit heeft gedraait en de db bestaat
- Zie [https://github.com/GemeenteNijmegen/devops/blob/master/docs/AWS/database-recovery-migration.md](database-migration) docs voor migratie via cloudshell.
- Cloudshell in VPC aanmaken.
- Commandos draaien (zie hieronder)
- DB toggle omzetten bij uitrollen

```bash
sudo dnf remove postgresql16 -y && sudo dnf install postgresql17 -y
export ENDPOINT=mijn-services-database-st-databasedbinstance7bee76-i7gobfwu9mrz.cby22yowugui.eu-central-1.rds.amazonaws.com
pg_dump -h $ENDPOINT -U mijn_services -d open-notificaties -Fc -f open-notificaties.dump
psql -h $ENDPOINT -U mijn_services -d open-notificaties-database -c "CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA public;"
pg_restore -h $ENDPOINT -U mijn_services -d open-notificaties-database --no-owner --role=open-notificaties-database -F c open-notificaties.dump
```
