# GZAC Setup & Deployment

Deze documentatie beschrijft de handmatige stappen die nodig zijn om GZAC (frontend + backend) werkend te krijgen na een (her)deployment.

## Overzicht

- **Frontend**: `gzac.{hostedzone}` (bijv. `gzac.mijn-services-dev.csp-nijmegen.nl`)
- **Backend**: `gzac-api.{hostedzone}` (bijv. `gzac-api.mijn-services-dev.csp-nijmegen.nl`)
- **Keycloak realm**: `gzac`
- **Docker images**: `ritense/gzac-frontend` en `ritense/gzac-backend` (versie 13.x)

## Handmatige stappen na deployment

### 1. Keycloak realm aanmaken

In de Keycloak admin console (`https://keycloak.{hostedzone}/admin/master/console/`):

1. Klik op de realm dropdown (linkerboven) → "Create realm"
2. Realm name: **`gzac`**

### 2. Keycloak client: `gzac-frontend`

In de `gzac` realm → Clients → Create client:

| Instelling | Waarde |
|---|---|
| Client ID | `gzac-frontend` |
| Client type | OpenID Connect |
| Client authentication | Off (public client) |
| Valid Redirect URIs | `https://gzac.{hostedzone}/*` |
| Valid Post Logout Redirect URIs | `https://gzac.{hostedzone}/*` |
| Web Origins | `https://gzac.{hostedzone}` |

### 3. Keycloak client: `valtimo-user-m2m-client`

In de `gzac` realm → Clients → Create client:

| Instelling | Waarde |
|---|---|
| Client ID | `valtimo-user-m2m-client` |
| Client type | OpenID Connect |
| Client authentication | On (confidential) |
| Service accounts roles | On |
| Authorization | On |

**Client secret synchroniseren:**

1. Ga in Keycloak naar de client `valtimo-user-m2m-client` → tab "Credentials"
2. Kopieer het Client Secret dat Keycloak heeft gegenereerd
3. Ga in AWS naar Secrets Manager
4. Zoek het secret dat is aangemaakt door de GZAC backend stack (naam bevat `gzac-backend-m2m-credentials`)
5. Bewerk het secret en plak de Keycloak-waarde in het `secret` veld
6. Herstart de GZAC backend ECS service zodat het nieuwe secret wordt opgepikt

> **Let op**: Neem altijd het secret vanuit Keycloak als bron van waarheid en zet dat in Secrets Manager. Zo weet je zeker dat Keycloak het secret herkent.

### 4. Azure AD koppeling (Identity Provider)

Om admin users via AD te laten inloggen in de `gzac` realm:

1. Identity Providers → Add provider → "Keycloack OpenID Connect"
2. Alias: `medewerker-oidc`
3. Zie andere realms voor instelling van "identity providers".
4. Zet "First Login Flow" op een flow die automatisch gebruikers aanmaakt
5. Mapper toevoegen voor het mappen van AD groepen naar Keycloak roles
6. Registreer de Redirect URI in Azure AD app registration → Authentication:
   `https://keycloak.{hostedzone}/realms/gzac/broker/medewerker-oidc/endpoint`

### 5. Realm roles aanmaken

GZAC verwacht de volgende realm roles in de `gzac` realm:

- `ROLE_USER` — basis toegang
- `ROLE_ADMIN` — admin toegang

Wijs deze toe aan gebruikers die via AD binnenkomen (via Identity Provider mappers of als default role).

### 6. SSM Parameters controleren

Na eerste deployment worden SSM parameters aangemaakt met default waarden afgeleid van de hostedzone. Controleer in AWS Systems Manager → Parameter Store of deze correct zijn:

| Parameter | Verwachte waarde |
|---|---|
| `/{project}/{id}/frontend/api-url` | `https://gzac-api.{hostedzone}` |
| `/{project}/{id}/frontend/keycloak-url` | `https://keycloak.{hostedzone}` |
| `/{project}/{id}/frontend/keycloak-realm` | `gzac` |
| `/{project}/{id}/frontend/keycloak-client-id` | `gzac-frontend` |
| `/{project}/{id}/frontend/keycloak-redirect-uri` | `https://gzac.{hostedzone}` |
| `/{project}/{id}/frontend/keycloak-logout-redirect-uri` | `https://gzac.{hostedzone}` |
| `/{project}/{id}/backend/keycloak-url` | `https://keycloak.{hostedzone}` |
| `/{project}/{id}/backend/keycloak-realm` | `gzac` |

Deze worden dynamisch gezet vanuit de hostedzone en hoeven normaal niet handmatig aangepast te worden.

## PBAC (Policy Based Access Control)

Valtimo 13.x gebruikt PBAC om API-toegang te reguleren. Het stock Docker image (`ritense/gzac-backend`) bevat **geen** permission-configuratie, waardoor alle endpoints standaard 403 Forbidden teruggeven — ook al is de JWT-authenticatie succesvol.

### Hoe het werkt

- Bij het opstarten scant de backend de classpath op `config/global/role/*.role.json` en `config/global/permission/*.permission.json`.
- Roles definiëren welke Keycloak realm roles herkend worden door PBAC.
- Permissions koppelen een `roleKey` + `resourceType` + `actions` combinatie. Zonder matching permission → 403.
- De env var `VALTIMO_CHANGELOG_PBAC_CLEAR_TABLES=true` zorgt ervoor dat de permission-tabel bij elke startup wordt opgeschoond en opnieuw geladen vanuit de JSON-bestanden.

### Bestanden

De PBAC configuratie wordt geïnjecteerd via een custom Dockerfile (`src/containers/gzac-backend/Dockerfile`) die het stock image uitbreidt. Een multi-stage build pakt de WAR uit, voegt de permission file toe aan `WEB-INF/classes/config/pbac/`, en herpackeert hem:

```
src/containers/gzac-backend/
├── Dockerfile
└── config/pbac/
    └── all.permission.json  # Verleent toegang per resource type per role
```

De roles (`ROLE_USER`, `ROLE_ADMIN`) zitten al in het stock image (`WEB-INF/classes/config/pbac/all.role.json`).

### Permissions aanpassen

Om permissions toe te voegen of te wijzigen:

1. Bewerk `src/containers/gzac-backend/config/pbac/all.permission.json`
2. Elke entry heeft de volgende structuur (het bestand is een changeset met een array van individuele permissions):
   ```json
   {
     "changesetId": "mijn-services-permissions-v1",
     "permissions": [
       {
         "resourceType": "com.ritense.document.domain.impl.JsonSchemaDocument",
         "action": "view",
         "roleKey": "ROLE_ADMIN"
       }
     ]
   }
   ```
3. Deploy opnieuw — de permissions worden bij startup automatisch geladen
4. Optioneel: voeg `conditions` toe voor fijnmazige toegangscontrole (bijv. alleen specifieke zaaktypen)

### Bekende resource types

| Resource type | Beschrijving |
|---|---|
| `com.ritense.case_.domain.definition.CaseDefinition` | Zaaktype definities |
| `com.ritense.document.domain.impl.JsonSchemaDocument` | Zaken/documenten |
| `com.ritense.document.domain.impl.JsonSchemaDocumentDefinition` | Document definities |
| `com.ritense.valtimo.operaton.domain.OperatonTask` | Taken |
| `com.ritense.dashboard.domain.Dashboard` | Dashboards |
| `com.ritense.note.domain.Note` | Notities |
| `com.ritense.zakenapi.security.Zaak` | ZGW Zaken |
| `com.ritense.objectenapi.security.Object` | Objecten API |

### Belangrijk

- Er bestaat **geen** `valtimo.authorization.enabled=false` property om PBAC uit te schakelen.
- De enige manier om 403's op te lossen is door de juiste permissions te deployen.
- ROLE_ADMIN in Keycloak moet exact matchen met de `roleKey` in de permission files.

## Troubleshooting

### Backend geeft 403 op alle endpoints (PBAC)

Als de JWT-authenticatie werkt (je ziet `Authenticated token` in de logs) maar alle API calls 403 geven:

- Controleer of de permission files correct in het Docker image zitten: `docker run --rm <image> ls /app/resources/config/global/permission/`
- Check de backend logs op: `"Requesting permissions 'view:...' and found matching permissions: []"` — lege lijst = geen permissions geconfigureerd
- Verifieer dat de Keycloak realm roles (`ROLE_USER`, `ROLE_ADMIN`) exact matchen met de `roleKey` in de permission JSON
- Bij twijfel: zet `VALTIMO_CHANGELOG_PBAC_CLEAR_TABLES=true` om een frisse deploy van permissions af te dwingen

### Backend start niet op

Check de ECS task logs. Veelvoorkomende fouten:

- **`Could not resolve placeholder 'SPRING_SECURITY_OAUTH2_...'`**: Er mist een environment variable in de task definition. Controleer of de CDK stack correct is gedeployed.
- **`Connection refused` op RabbitMQ**: De RabbitMQ sidecar service is niet gestart of de service discovery naam klopt niet. Check of de RabbitMQ task draait in hetzelfde cluster.
- **`401` of `403` bij Keycloak**: Het client secret in Secrets Manager matcht niet met Keycloak. Sync de secrets (zie stap 3).

### Frontend laadt niet

- Controleer of de backend URL in de SSM parameter correct is en of de backend daadwerkelijk draait
- Check CORS: de backend moet requests van de frontend domain toestaan (wordt automatisch gezet)
- Controleer of het Keycloak realm `gzac` bestaat en de client `gzac-frontend` correct is ingesteld

## Upgraden

Images updaten in `src/configuration/development.ts` (of de relevante omgeving):

```typescript
gzacFrontendServices: [{
  image: 'ritense/gzac-frontend:{versie}',
  // ...
}],
gzacServices: [{
  image: 'ritense/gzac-backend:{versie}',
  // ...
}],
```

Check Docker Hub voor de laatste versies:
- https://hub.docker.com/r/ritense/gzac-frontend/tags
- https://hub.docker.com/r/ritense/gzac-backend/tags

> **Let op**: Frontend en backend versies moeten op dezelfde minor versie zitten (bijv. beide 13.41.0).
