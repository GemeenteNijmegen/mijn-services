# Upgrade open-zaak

Huidige versie: 1.17.0 prod 
Latest versie: 1.30.0

## Changelog doornemen
- 1.19.0 - Nieuwe kenmerken op kanalen (commando draaien) minimaal open-notificaties 1.8.0 (wij zitten op 1.8.0)
- 1.20.0 - Migratie commando python src/manage.py migrate_vestigingen_to_nnps (Rol met betrokkenetype verstiging -> niet natuurijk persoon). Ik denk niet relevant voor ons (uitzoeken)
- 1.21.0 - Django version requires postgres >14 (wijz zitten op 17.5)
- 1.24.0 - convenience endpoints (zaak_registreren bijv.) 
- 1.26.0 - OIDC changes en OTEL enabled by default (incl. cloud events, disabled and not ready for prod)
- 1.27.0 - Nieuw storage backends (s3, azure blob)
- 1.28.0 - Latest geen speciale dingen
- 1.29.0 - datamigratie documenten
- 1.30.0 - healthcheck aanroep gewijzigd: https://open-zaak.readthedocs.io/en/stable/installation/health_checks.html#installation-health-checks


## Stap 0 - Voorbereiding
- Zorg dat de OTEL uit staat (env vars.) In huidige open zaak service staat al `OTEL_SDK_DISABLED: 'true',`
- Zorg dat de container voor de main service groot genoeg is (op dev ging het pas goed met een container van 0.5 vcpu en 1gb mem)
- Zorg dat de timeouts voor health checks 2,5minuten zijn minstends (container health check en ALB health check graceperiod)

Zet de benodigde variabelen op een rijtje klaar uit de omgeving:

Endpoint uit RDS per omgeving
`export ENDPOINT=<vul hier het endpoint in>`

Secret mijn-services database
/mijn-services/internal/database/credentials

S3 bucketnaam voor backup dumps
`aws s3 cp ./<<NAAM LOKALE DUMPFILE MET DATUM>>.dump s3://<<S3 NAAM>>/<<NAAM DUMPFILE MET DATUM>>.dump`

## Stap 1.1 - Upgrade migrationtask naar 1.23.0 en zet open-zaak uit

In de config van de omgeving in deze repo
- Alle services stoppen via config (desired task count 0) in taskdefinition (main en celery)
- Migrationtask toevoegen aan config met `1.23.0`
- Deployment (waarbij de hoofdcontainers dus uit zullen staan)

Zorgt dat de nieuwe database klaar staat zoals in stap 2
Na deployment draai stap 3: migration task.

## Stap 1.2 - Upgrade migrationtask van 1.23.0 naar laatste versie en zet open-zaak uit

In de config van de omgeving in deze repo
- Alle services stoppen via config (desired task count 0) in taskdefinition (main en celery) 
- Migrationtask toevoegen aan config met laatste versie `1.30.0`
- Deployment (waarbij de hoofdcontainers dus uit zullen staan)

Zorgt dat de nieuwe database klaar staat zoals in stap 2 (zou bij de vorige stap naar 1.23.0 al zo moeten zijn)
Na deployment draai stap 3: migration task.


## Stap 2 - DB migratie (zodra open zaak uit staat)
- Checken of de additional database resource lambda ooit heeft gedraaid en de db bestaat
- Zie [https://github.com/GemeenteNijmegen/devops/blob/master/docs/AWS/database-recovery-migration.md](database-migration) docs voor migratie via cloudshell.
- Cloudshell in VPC aanmaken (Securitygroup database manage)
- Commandos draaien (zie hieronder)
- DB toggle omzetten bij uitrollen `useNewDatabase: true,`

Pas het commando aan met jouw endpoint en de datum van de dump in het bestand (regel 3 en regel 5)

```bash
sudo dnf remove postgresql16 -y && sudo dnf install postgresql17 -y
export ENDPOINT=<HET ENDPOINT>
pg_dump -h $ENDPOINT -U mijn_services -d open-zaak -Fc -f open-zaak.dump
psql -h $ENDPOINT -U mijn_services -d open-zaak-database -c "CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA public;"
pg_restore -h $ENDPOINT -U mijn_services -d open-zaak-database --no-owner --role=open-zaak-database -F c open-zaak.dump
```


Check of de nieuwe database gevuld is:

`psql -h $ENDPOINT -U mijn_services -d postgres`

`\l` 

Inloggen mijn-services wachtwoord
```
\c open-zaak-database

\dt
```

Voer eventueel een query uit om de laatste zaken op te halen:
`SELECT * FROM zaken_zaak  ORDER BY registratiedatum DESC LIMIT 10;`

Backup is nu gemaakt.
Nieuwe database is gemaakt en gevuld
De config van de omgeving  `useNewDatabase: true,` is gedeployed

### Stap 2.1 Check 1.29.0 data migratie nulmeting
https://github.com/open-zaak/open-zaak/blob/1.29.0/src/openzaak/components/documenten/migrations/0037_enkelvoudiginformatieobjectcanonical_latest_version.py

Er gaat een kolom bijkomen. Dus die kunnen we voor de updates checken en daarna. 

```
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'documenten_enkelvoudiginformatieobjectcanonical'
  AND column_name = 'latest_version_id';
```
--> Moet niet aanwezig zijn nu

```
SELECT COUNT(DISTINCT canonical_id) AS expected_latest_versions
FROM documenten_enkelvoudiginformatieobject;
```
--> aantal records waarvoor latest_verion_id aangemaakt moet worden.

## Stap 3 - Draai de migrationtask
Controleer de task definition of het echt de juiste versie is in de console `open-zaak-migrate`

- Lokaal log in het mijn-services account met ep rechten
- Draai eerst `bash bin/django-migrate/run-objects-migrate.sh `
- Hier moet openzaak bij staan
- `bash bin/django-migrate/run-objects-migrate.sh --prefix openzaak`  --> kijk of het de juiste versie van de taskdefinition is
- `bash bin/django-migrate/run-objects-migrate.sh --prefix openzaak run` --> met run draait het echt en toont de logs


Controleer eventueel de nieuwe database om te zien of latets_version_id nu bestaat er gevuld is met de queries uit de vorige stap bij de upgrade naar `1.30.0`

## Stap 4 - Updaten main en celery


Pull request
In de config van de omgeving:
- Update de versie van main EN celery
- 1.30.0
- Laat desiredtaskcount op 0 staan voor nu

Deploy

- Zet in de console main en celery naar desired task count 1
- Controleer de logs

Pull request
In de conig van de omgeving:
- Zet de desired task count op 1

Deploy

- Check of de container gestart zijn

## Stap 5
Zaak aanmaken met documenten gaat snel door de hele keten met een testformulier.

Retry failures van alles dat mis is gegaan in open forms.



## Rollback
Indien het fout gaat:

Pull request:
In de omgeving:
- newDatabase false
- Versies main en celery 1.17.0




## Healthchecks na goede uitrol


Controleer eerst de healthcheck uit versie update 1.30.0 in beide containers.

Oude container:
```
  command: [
    'CMD-SHELL',
    'python /app/bin/check_celery_worker_liveness.py >> /proc/1/fd/1 2>&1',
  ],
```

Nieuwe container:
```
  command: [
    'CMD-SHELL',
    '/app/bin/celery_worker_liveness_probe.sh >> /proc/1/fd/1 2>&1',
  ],
```

Als er een health check in de loadbalancer is:
`path: '/',`

Naar
`path: '/_healthz/livez/',`