# Migratie stappen productie open-object

## Dag 1. Database migratie

OpenForms token uitzetten
Uitzetten services
Drop & opnieuw aanmaken objects-database via lambda (na gefaalde upgrade).
Scripts hieronder uitvoeren
CDK deployment met nieuwe DB flag voor open-objecten
OpenForms token fixen

```bash
sudo dnf remove postgresql16
sudo dnf install postgresql17
export ENDPOINT=prod-db-server.eu-central-1.rds.amazonaws.com
pg_dump -h $ENDPOINT -U mijn_services -d objects -Fc -f objects.dump
psql -h $ENDPOINT -U mijn_services -d objects-database -c "CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA public;"
pg_restore -h $ENDPOINT -U mijn_services -d objects-database --no-owner --role=objects-database -F c objects.dump
```

## Dag 2. Upgrade naar 3.6.1
- Dubbelcheck of migratie-task 3.6.1 is.
- Token OpenForms vervangen
- Service uitzetten (celery en web) via CDK: Desired tasks op 0
- Dump database maken en in S3 zetten.
- migratietaak draaien: ```bash src/django-migrate/run-objects-migrate.sh``` en dan ```bash src/django-migrate/run-objects-migrate.sh run```
- Deploy van 3.6.1 voor normale task. met desiredtasks weer naar 1
- Token OpenForms fixen als alles weer werkt

Getest:
- Handmatig draaien van de taak en migratie script runnen
- Service update na handmatig aanpassen wanneer desired task count 0 is, zorgt voor starten nieuwe alleen nieuwe task definitions wanneer desired task count weer wordt opgehoogd.


## Dag 3. Upgrade naar 4.1.0
- Zelfde stappen als dag 2
Daarnaast:
- Import commando draaien voor uitzetten container
- Checken in DB of imports zijn geslaagd.

Let op: Externe afhankelijkheden
- Open Forms
- ESF (op ESB)
