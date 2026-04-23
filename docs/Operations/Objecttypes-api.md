
# Dev test objecten API migratie

## Release notes doornemen
Momenteel: 3.0.0
Latest: 4.0.0

Letop: Na 4.0.0 wordten objecten en objecttypes niet meer apart gedraaied maar in een applicatie.

Release notes waar we iets mee moeten
- 3.0.4 - django upgrade requires postgress > 14 (we zitten op 17.5)
- 3.4.0 - Version contains a migration - Long running migration -> Ik voorzie container start problemen (of we moeten via Celery deze upgrade uitrollen, die kan lang draaien.)
- 3.5.0 - open telemetry moeten we even uitzetten in de config + OIDC wijziging, dit ging in open-klant goed zonder problemen.
- 3.6.0 - Command om objecttypes te importeren - https://open-object.readthedocs.io/en/latest/manual/migration.html#objecttype-migration Verplichte versie upgrade!
- 4.0.0 - Removes external objecttypes support!

## Database migratie

```bash
sudo dnf remove postgresql15
sudo dnf install postgresql17
export ENDPOINT=mijn-services-database-st-databasedbinstance7bee76-i7gobfwu9mrz.cby22yowugui.eu-central-1.rds.amazonaws.com
pg_dump -h $ENDPOINT -U mijn_services -d objecttypes -Fc -f objecttypes.dump
psql -h $ENDPOINT -U mijn_services -d objecttypes-database -c "CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA public;"
pg_restore -h $ENDPOINT -U mijn_services -d objecttypes-database --no-owner --role=objecttypes-database -F c objecttypes.dump
```

## Starten op nieuwe DB
Handmatig aanpassen DB_*_NEW env vars in task defintion om te testen.
- DB_NAME -> DB_NAME_OLD
- DB_NAME_NEW -> DB_NAME
- Ook voor DB_USER en DB_PASSWORD

Updaten service naar laatste taskdefinition ID & valideren of de service start


### Feature flag
Ik heb een feature flag geimplementeerd om de DB_NAME, DB_USER en DB_PASSWORD env vars te toggelen tussen de oude en nieuwe DB. Dit zorgt ervoor dat de change met secrets overal uitgerold kan worden en we per omgeving en per service kunnen toggelen waar nodig. 

Deze is omgezet nu, de service draait op de nieuwe DB.



## Objects API
```bash
sudo dnf remove postgresql15
sudo dnf install postgresql17
export ENDPOINT=mijn-services-database-st-databasedbinstance7bee76-i7gobfwu9mrz.cby22yowugui.eu-central-1.rds.amazonaws.com
pg_dump -h $ENDPOINT -U mijn_services -d objects -Fc -f objects.dump
psql -h $ENDPOINT -U mijn_services -d objects-database -c "CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA public;"
pg_restore -h $ENDPOINT -U mijn_services -d objects-database --no-owner --role=objects-database -F c objects.dump
```

### Error on spatial_ref_sys:
Ik zie de error:
```
pg_restore: error: could not execute query: ERROR:  must be owner of extension postgis
Command was: COMMENT ON EXTENSION postgis IS 'PostGIS geometry and geography spatial types and functions';

pg_restore: error: could not execute query: ERROR:  permission denied for table spatial_ref_sys
Command was: COPY public.spatial_ref_sys (srid, auth_name, auth_srid, srtext, proj4text) FROM stdin;
```

Deze negeer ik nu omdat:
- Comment dit is niet relevant. Gaat fout omdat we de extensie in een eerdere stap hebben aangemaakt vermoed ik.
- What is spatial_ref_sys used for? It's a lookup table that's part of the PostGIS standard. It stores coordinate reference systems (CRS) — also called spatial reference systems. Deze error kunnen we dus negeren in RDS omdat dit wordt aangemaakt door de postgis extentie en niet wordt geimporteerd in de DB.


# Fase 2 - Importeren objecttypen defenities
Draai in de objecten API het commando:
`python src/manage.py import_objecttypes <objecttypen-service-name>`
Waar de naam de naam is van de service configuratie voor de objecttypen api in de objects applicatie.


# Fase 3 - Upgraden open-objecten
Nu alles geimporteerd is in 3.6.0 gaan we de objecten api zelf upgraden.
Nu worden de objecttypen gebruik die we in fase 2 hebben geimporteerd.

In de Configuration.ts doe de volgende aanpassing:
```diff
- image: 'maykinmedia/objects-api:3.6.0'
+ image: 'maykinmedia/open-object:4.0.0'
```

De image is dus verplaatst en objecttypen en objecten zijn samengevoegd tot open-object.