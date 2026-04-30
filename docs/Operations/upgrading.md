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


## Open-notificaties
- 1.10.0 - Requires postgres > 14 - we zitten op 17.5
- 1.12.0 - RabbitMQ configuratie update nodig: consumer_timeout
- 1.14.0 - OIDC + CloudEvents + OpenTelemetry wijziging in config nodig.

Denk dat we in een keer kunnen upgraden
Afhankelijkheden om te testen na upgraden:
- Objecten API (voor inzending)
- Open-Zaak (voor authorisatie component)

Verder hebben we open-notificaties nog niet gekoppeld met onze mijn-services componenten.

