# IKO Setup & Deployment

Deze documentatie beschrijft de handmatige stappen die nodig zijn om IKO (Integraal Klant & Objectbeeld) werkend te krijgen na een eerste deployment.

## Overzicht

- **URL**: `iko.{hostedzone}` (bijv. `iko.mijn-services-dev.csp-nijmegen.nl`), admin UI op `/admin`
- **Docker image**: `ghcr.io/integraal-klant-en-objectbeeld/iko` ([repository](https://github.com/Integraal-Klant-en-Objectbeeld/iko))
- **Keycloak realm**: `iko` (op de gedeelde keycloak `keycloak.{hostedzone}`)
- **Keycloak client**: `iko`
- **Database**: eigen database (naam uit configuratie, standaard `iko`) op de gedeelde RDS instance, wordt automatisch aangemaakt
- **Redis**: gedeelde ElastiCache cluster, eigen database nummer (`redisDatabaseNumber` in de configuratie)
- **Health check**: `/actuator/health/readiness` op management poort `9090`. Actuator is niet bereikbaar via de publieke URL.

Elke IKO instance staat in een eigen nested stack (`{id}-stack`), omdat de main stack tegen de CloudFormation limiet van 500 resources aan zit.

## Handmatige stappen na deployment

### 1. Encryptiesleutel zetten

IKO versleutelt connector configuratie (hosts, tokens) in de database met een AES-256 sleutel. CDK zet een placeholder (`REPLACE_ME_...`); zolang die erin staat start IKO niet op.

1. Genereer een sleutel: `openssl rand -base64 32`
2. Ga in AWS naar Secrets Manager en zoek het secret met `crypto-key` in de naam
3. Zet de gegenereerde waarde in het `key` veld

> **Let op**: Wijzig deze sleutel niet meer zodra er connectoren zijn ingericht. Bestaande configuratie kan dan niet meer worden ontsleuteld.

### 2. Keycloak realm aanmaken

In de Keycloak admin console (`https://keycloak.{hostedzone}/admin/master/console/`):

1. Klik op de realm dropdown (linkerboven) → "Create realm"
2. Realm name: **`iko`**

Ter referentie bevat de IKO repository een realm export voor lokaal gebruik: `imports/keycloak/realm.json`.

### 3. Keycloak client: `iko`

In de `iko` realm → Clients → Create client:

| Instelling | Waarde |
|---|---|
| Client ID | `iko` |
| Client type | OpenID Connect |
| Client authentication | On (confidential) |
| Standard flow | On |
| Valid Redirect URIs | `https://iko.{hostedzone}/*` |
| Valid Post Logout Redirect URIs | `https://iko.{hostedzone}/*` |
| Web Origins | `https://iko.{hostedzone}` |

**Client secret synchroniseren:**

1. Ga in Keycloak naar de client `iko` → tab "Credentials"
2. Kopieer het Client Secret
3. Ga in AWS naar Secrets Manager en zoek het secret met `keycloak-client-credentials` in de naam
4. Plak de waarde in het `secret` veld

### 4. Rollen en mappers

IKO leest rollen op twee plekken:

- **Admin UI** (`/admin`): de claim `roles` in de **ID token** moet `ROLE_ADMIN` bevatten.
- **API** (`/endpoints/**`, `/aggregated-data-profiles/**`): client rollen uit `resource_access.iko.roles` in de access token, met audience `iko`.

Inrichting:

1. Maak een realm role `ROLE_ADMIN` aan en wijs deze toe aan beheerders
2. Client `iko` → Client scopes → `iko-dedicated` → Add mapper → "User Realm Role":
   - Token Claim Name: `roles`
   - Multivalued: On
   - Add to ID token: On
3. Client `iko` → Roles: maak de client rollen aan die API clients nodig hebben (bijv. `ROLE_USER`)
4. Voor API clients (bijv. GZAC): voeg een "Audience" mapper toe met included client audience `iko` en ken de benodigde client rollen van `iko` toe aan hun service account

### 5. Service herstarten

Herstart de IKO ECS service (force new deployment) zodat de nieuwe secrets worden opgepikt.

## Connectoren

Connectoren (Open Klant, Objecten API, Open Zaak, BRP, ...) worden niet via deze repository ingericht. Ze staan in de IKO database en worden beheerd in de admin UI onder `/admin/connectors`:

- De connector code (Camel YAML) staat per connector in de IKO repository onder `doc/connectors/`
- Per connector instance worden host en token in de admin UI ingevuld; deze worden versleuteld opgeslagen met de sleutel uit stap 1

Met `debug: true` toont de debug trace viewer in de admin UI ruwe request headers, inclusief tokens van connectoren. Zet dit niet aan in productie.

Connectoren die mTLS nodig hebben (zoals BRP via de WS-gateway) vereisen keystores en `CAMEL_SSL_*` environment variables in de container. Dit is nog niet ingericht.

## Troubleshooting

### Service start niet of wordt steeds herstart

- **`Illegal base64 character`**: de encryptiesleutel is nog de placeholder of heeft niet het juiste formaat (zie stap 1).
- Check de ECS task logs. IKO (Spring Boot + Camel) heeft een paar minuten nodig om op te starten; de health check grace period is 5 minuten.
- **Database fouten bij opstarten**: controleer of de `Custom::SingleDatabase` resource de database heeft aangemaakt en of het db credentials secret klopt.

### Inloggen op /admin lukt niet

- **Redirect naar `http://` in plaats van `https://`**: IKO gebruikt `X-Forwarded-Proto` om de redirect URI op te bouwen. Controleer de headers die CloudFront en de loadbalancer doorgeven.
- **403 na inloggen**: de ID token bevat geen `roles` claim met `ROLE_ADMIN` (zie stap 4).
- **`invalid_client`**: het client secret in Secrets Manager matcht niet met Keycloak (zie stap 3).

## Upgraden

Image tag aanpassen in `src/configuration/development.ts`:

```typescript
ikoServices: [{
  image: 'ghcr.io/integraal-klant-en-objectbeeld/iko:{versie}',
  // ...
}],
```

Releases staan op [github.com/Integraal-Klant-en-Objectbeeld/iko/releases](https://github.com/Integraal-Klant-en-Objectbeeld/iko/releases). Database migraties draaien automatisch bij het opstarten.
