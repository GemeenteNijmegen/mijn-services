# Upgrading Mijn-Services components



## Plan for major upgrades (April 2026)

**Step 0:**

Kijken in de release notes of er scripts gedraait moeten worden of we naar specificke versies moeten upgraden voor we naar latest kunnen.


**Step 1:**

Database migreren naar DB met specifieke user.
Dit geeft ons tevens een backup mochten de upgrades fout gaan.


**Step 2:**

Container versie nummer in configuratie.ts updaten.
Scripts draaien als dat nodig is.


**Step 3:**

Checken of de container nog goed werkt.



## Open-objecten
Momenteel: 3.0.0 
Latest: 4.0.0

Letop: Na 4.0.0 wordten objecten en objecttypes niet meer apart gedraaied maar in een applicatie.

Release notes waar we iets mee moeten
- 3.0.4 - django upgrade requires postgress > 14 (we zitten op 17.5)
- 3.4.0 - Version contains a migration - Long running migration -> Ik voorzie container start problemen (of we moeten via Celery deze upgrade uitrollen, die kan lang draaien.)
- 3.5.0 - open telemetry moeten we even uitzetten in de config + OIDC wijziging, dit ging in open-klant goed zonder problemen.
- 3.6.0 - Command om objecttypes te importeren - https://open-object.readthedocs.io/en/latest/manual/migration.html#objecttype-migration Verplichte versie upgrade!
- 4.0.0 - Removes external objecttypes support!


## Open-notificaties
- 1.10.0 - Requires postgres > 14 - we zitten op 17.5
- 1.12.0 - RabbitMQ configuratie update nodig: consumer_timeout
- 1.14.0 - OIDC + CloudEvents + OpenTelemetry wijziging in config nodig.

Denk dat we in een keer kunnen upgraden
Afhankelijkheden om te testen na upgraden:
- Objecten API (voor inzending)
- Open-Zaak (voor authorisatie component)

Verder hebben we open-notificaties nog niet gekoppeld met onze mijn-services componenten.

