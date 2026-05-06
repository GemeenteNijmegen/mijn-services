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


## Vervolg
- Elke service heeft zijn eigen upgrade documentje zie andere documenten in deze map.