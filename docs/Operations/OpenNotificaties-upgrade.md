# Upgrade open-notificaties

Huidige versie: 1.8.0
Tussenstop versie: 1.12.0
Latest versie: 1.16.2


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

Extra docs: [database-migration docs voor migratie via cloudshell.](https://github.com/GemeenteNijmegen/devops/blob/master/docs/AWS/database-recovery-migration.md) 




















## Stap 1 - DB migratie
- Checken of de additional database resource lambda ooit heeft gedraait en de db bestaat. (done)
- Objecten API desired task count op 0 zetten (handmatig).
- Open notificaties uitzetten via code (eerst checken of queue leeg is met commando: `commando uitzoeken`). 
- Deploy met new nieuwe DB flag met desired task count op 0 (blijft 0).


```bash
# Setup
sudo dnf remove postgresql16 -y && sudo dnf install postgresql17 -y
export ENDPOINT=mijn-services-database-st-databasedbinstance7bee76-flmtkepal3jl.cxccc4g46hht.eu-central-1.rds.amazonaws.com

# Dump
pg_dump -h $ENDPOINT -U mijn_services -d open-notificaties -Fc -f open-notificaties.dump
aws s3 cp open-notificaties.dump s3://gn-mijn-services-accp-cloudshell-storage/open-notificaties-2026-09-23.dump

# checken of nieuwe DB bestaat
psql -h $ENDPOINT -U mijn_services -d postgres
\l

# Nieuwe DB importeren
psql -h $ENDPOINT -U mijn_services -d open-notificaties-database -c "CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA public;"
pg_restore -h $ENDPOINT -U mijn_services -d open-notificaties-database --no-owner --role=open-notificaties-database -F c open-notificaties.dump
```

Checken of DB import goed is gegaan: 
```bash
psql -h $ENDPOINT -U mijn_services -d postgres
\l 
\c open-notificaties-database
\dt
# SELECT * FROM "datamodel_notificatieresponse" LIMIT 10;
```



## Stap 2 - Migraties draaien
- Draai de migratie van 1.12.0 `bash bin/django-migrate/run-objects-migrate.sh --prefix opennotificaties`
- Nieuwe PR: 
  - Migratie image upgraden naar 1.16.2
  - Upgraden runtime image naar 1.16.2
  - Use redis flag op true zetten
  - Nieuwe celery health check aanzetten
- Draai de migratie van 1.16.2 `bash bin/django-migrate/run-objects-migrate.sh --prefix opennotificaties`


## Stap 3 - Starten services
- desired task count op 1 om de boel weer aan te zetten

## Stap 4 - Aanzetten objects
- Objecten API weer aanzetten
- Formulieren retriern vanuit open-forms

