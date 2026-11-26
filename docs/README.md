# Mijn Services


## Output Management Component
Het OMC luistert naar events (notificaties) vanuit de ZGW-registraties, en kan
(klant)notificatie-berichten sturen op basis van deze events. Om een OMC in te richten
kun je in de configuratie een nieuw OMC opnemen. Per ZGW-constellatie is een OMC
nodig.

### Tips & tricks:
- Er zijn verschillende JWT's en API-keys nodig om het OMC te koppelen:
  - Het OMC genereert zijn eigen JWT om berichten te mogen ontvangen, dit
    op basis van de `OMC_AUTH_JWT_*` environment-variabelen (default: OMC voor alles)
    Secret in {omc-id}/omc-jwt
    Deze JWT configureer je in open notificaties onder ['notificaties/abonnementen'](https://mijn-services.accp.nijmegen.nl/open-notificaties/admin/datamodel/abonnement/) als 
    auth-header waarde (`Bearer <waarde>`). Test bijv. lokaal in postman en kopieer de header-waarde uit de console. **NB**: Deze is statisch geconfigureerd, wat betekent dat de JWT een lange geldigheid moet hebben. Momenteel is deze geconfigureerd op een dag (te kort). Zie env-var `OMC_AUTH_JWT_EXPIRESINMIN`. Configureer deze onder 
    'Notificaties/Abonnementen'. Voeg kanaal-filters toe voor 'zaken' en 'objecten'
  - Er is een ZGW-token nodig om in Open Zaak te mogen: De info hiervoor kun je in
    de configuratie opnemen (`OutputManagementComponentConfiguration.zgwTokenInformation`).
    Secret configureer je in {omc-id}/zgw-jwt.
    Deze moet onder ['API-authorisaties/Applicaties'](https://mijn-services.accp.nijmegen.nl/open-zaak/admin/authorizations/applicatie) in open zaak geconfigureerd zijn. 
  - Het OMC heeft een API-key nodig om bij Open Klant te kunnen, deze wordt in de
    secrets manager opgeslagen als {omc-id}/open-klant/api-key. De key komt uit 'API-auth/Token authoriztions' (nieuwe aanmaken).
 
## IKO (Integraal Klant & Objectbeeld)
IKO combineert gegevens uit verschillende bronnen (Open Klant, Objecten API, Open Zaak, BRP, ...)
tot één klant- en objectbeeld. Een IKO instance neem je op in de configuratie onder `ikoServices`.
Na de eerste deployment zijn handmatige stappen nodig in Keycloak en Secrets Manager, zie
[IKO setup](./Operations/IKO-setup.md).

## Open Notificaties v2
Open Notificaties per Open Zaak, elk op een eigen subdomein en als één ECS service (web, celery en
celery beat in één task, Redis als broker). Een instance neem je op in de configuratie onder
`openNotificatiesServices`. De koppeling met Open Zaak wordt na de deployment met de hand ingericht, zie
[Open Notificaties v2 setup](./Operations/OpenNotificaties-v2.md).
