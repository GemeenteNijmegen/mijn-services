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
2. Zie andere realms voor instelling van "identity providers".
3. Zet "First Login Flow" op een flow die automatisch gebruikers aanmaakt
4. Mapper toevoegen voor het mappen van AD groepen naar Keycloak roles

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

## Troubleshooting

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
