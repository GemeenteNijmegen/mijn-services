# Migratie stappen productie open-object

## Dag 1. Database migratie

- OpenForms token uitzetten
- Uitzetten services
- Drop & opnieuw aanmaken objects-database via lambda (na gefaalde upgrade).
- Scripts hieronder uitvoeren
- CDK deployment met nieuwe DB flag voor open-objecten
- OpenForms token fixen

```bash
sudo dnf remove postgresql16
sudo dnf install postgresql17
export ENDPOINT=prod-db-server.eu-central-1.rds.amazonaws.com
pg_dump -h $ENDPOINT -U mijn_services -d objects -Fc -f objects.dump
psql -h $ENDPOINT -U mijn_services -d objects-database -c "CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA public;"
pg_restore -h $ENDPOINT -U mijn_services -d objects-database --no-owner --role=objects-database -F c objects.dump
```

## Dag 2. Upgrade naar 3.6.1
- Token OpenForms vervangen
- Handmatig nieuwe taskdefinition aanmaken met 3.6.1 ipv 3.0.0
- Service uitzetten (celery en web)
- Dump database maken en in S3 zetten.
- Taak starten (handmatig) met override commando `sleep,infinity` (comma moet daar staan).
- `python src/manage.py migrate` draaien
- Handmatig ECS services aanpassen (celery & web) naar nieuwe taskdefinitions
- Desired task count ophogen naar 1
- Deployment vanuit CDK met nieuwe versie nummers om de boel weer consistent te maken.
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
