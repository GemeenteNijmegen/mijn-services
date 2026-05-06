# Upgrade open-zaak

Huidige versie: 1.17.0
Latest versie: 1.28.0

## Changelog doornemen
- 1.19.0 - Nieuwe kenmerken op kanalen (commando draaien) minimaal open-notificaties 1.8.0 (wij zitten op 1.8.0)
- 1.20.0 - Migratie commando python src/manage.py migrate_vestigingen_to_nnps (Rol met betrokkenetype verstiging -> niet natuurijk persoon). Ik denk niet relevant voor ons (uitzoeken)
- 1.21.0 - Django version requires postgres >14 (wijz zitten op 17.5)
- 1.24.0 - convenience endpoints (zaak_registreren bijv.) 
- 1.26.0 - OIDC changes en OTEL enabled by default (incl. cloud events, disabled and not ready for prod)
- 1.27.0 - Nieuw storage backends (s3, azure blob)
- 1.28.0 - Latest geen speciale dingen


## Stap 0 - Voorbereiding
- Zorg dat de OTEL uit staat (env vars.)
- Zorg dat de container voor de main service groot genoeg is (op dev ging het pas goed met een container van 0.5 vcpu en 1gb mem)
- Zorg dat de timeouts voor health checks 2,5minuten zijn minstends (container health check en ALB health check graceperiod)



## Stap 1 - DB migratie
- Checken of de additional database resource lambda ooit heeft gedraait en de db bestaat
- Cloudshell in VPC aanmaken.
- Commandos draaien (zie hieronder)
- DB toggle omzetten bij uitrollen

```bash
sudo dnf remove postgresql15 -y && sudo dnf install postgresql17 -y
export ENDPOINT=mijn-services-database-st-databasedbinstance7bee76-i7gobfwu9mrz.cby22yowugui.eu-central-1.rds.amazonaws.com
pg_dump -h $ENDPOINT -U mijn_services -d open-zaak -Fc -f open-zaak.dump
psql -h $ENDPOINT -U mijn_services -d open-zaak-database -c "CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA public;"
pg_restore -h $ENDPOINT -U mijn_services -d open-zaak-database --no-owner --role=open-zaak-database -F c open-zaak.dump
```

## Stap 2 - Upgrade naar 1.23.0 (tussen stap)
- Alle services stoppen (desired task count 0)
- Start celery service
- Draaien migratie vanaf celery service: `python src/manage.py migrate`

Note: hoe alle services uit te krijgen voor de upgrade draait weet ik even niet


- Erg belangrijk, zorgen dat de main task groter is (startup tijden zijn 3+ minuten)


## Intressant - Downgrade
Ik heb perongeluk een downgrade gedaan van 1.23.0 naar 1.17.0. Dit lijkt eigenlijk gewoon goed te gaan en te werken.
Ofja ik kan inloggen en zie de data terug die in de app hangt.


## Stap 2 - Upgrade naar 1.28.0
- Versie nummer aanpassen na alle vorige aanpassingen -> upgrade ging goed.
- Health check op container zelf weg gehaald.