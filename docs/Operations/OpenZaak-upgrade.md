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
- 1.30.0 -


## Stap 0 - Voorbereiding
- Zorg dat de OTEL uit staat (env vars.)
- Zorg dat de container voor de main service groot genoeg is (op dev ging het pas goed met een container van 0.5 vcpu en 1gb mem)
- Zorg dat de timeouts voor health checks 2,5minuten zijn minstends (container health check en ALB health check graceperiod)

Zet de benodigde variabelen op een rijtje klaar uit de omgeving:

Endpoint uit RDS per omgeving
`export ENDPOINT=<vul hier het endpoint in>`

Secret mijn-services database
/mijn-services/internal/database/credentials

S3 bucketnaam voor backup dumps
`aws s3 cp ./<<NAAM LOKALE DUMPFILE MET DATUM>>.dump s3://<<S3 NAAM>>/<<NAAM DUMPFILE MET DATUM>>.dump`




## Stap 1 - Upgrade migrationtask naar laatste versie en zet open-zaak uit

In de config van de omgeving in deze repo
- Alle services stoppen via config (desired task count 0) in taskdefinition (main en celery)
- Migrationtask toevoegen aan config met laatste versie
- Deployment (waarbij de hoofdcontainers dus uit zullen staan)


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

Voer eventueel een query uit 
`SELECT * FROM zaken_zaak  ORDER BY registratiedatum DESC LIMIT 10;`

Backup is nu gemaakt.
Nieuwe database is gemaakt en gevuld
De config van de omgeving  `useNewDatabase: true,` is gedeployed

## Stap 3 - Draai de migrationtask
Specifieke securitygroup voor task open-zaak-migrate
