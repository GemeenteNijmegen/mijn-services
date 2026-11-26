# Open Notificaties (v2) setup

Open Notificaties v2 draait per instance op een eigen subdomein. Meestal hoort er één instance bij één Open Zaak, omdat Open Notificaties de Autorisaties API van die Open Zaak gebruikt. Die koppeling staat niet in de code: alle configuratie gebeurt na de deployment met de hand in de admin.

De oude Open Notificaties op `/open-notificaties` (`openNotificaties` in de configuratie) staat hier los van.

## Overzicht

- **URL**: `{subdomain}.{hostedzone}` (bijv. `sociaal-domein-open-notificaties.mijn-services-dev.csp-nijmegen.nl`), admin op `/admin`
- **Docker image**: `openzaak/open-notificaties` ([repository](https://github.com/open-zaak/open-notificaties))
- **ECS**: één service, één task met drie containers uit hetzelfde image:
  - `web`: draait bij het starten de database migraties en daarna de API en admin op poort `8000`
  - `celery`: verstuurt de notificaties naar de abonnees
  - `celery-beat`: plant het versturen (en opnieuw proberen) van notificaties en ruimt oude notificaties op. Is dus nodig, niet optioneel.
  - `celery` en `celery-beat` starten pas als `web` healthy is, zodat de migraties eerst klaar zijn.
- **Database**: eigen database (`databaseName`) op de gedeelde RDS instance, wordt automatisch aangemaakt
- **Redis**: gedeelde ElastiCache cluster, twee eigen database nummers: cache (`redisCacheDatabaseNumber`) en celery broker (`redisCeleryDatabaseNumber`). Geen RabbitMQ.
- **Nested stack**: elke instance staat in een eigen nested stack (`{id}-stack`), ook de load balancer rule en target group. De main stack zit tegen de CloudFormation limiet van 500 resources aan.

Meerdere tasks (`taskSize.desiredTaskCount` > 1) kan: het versturen gebruikt een lock in Redis, dus een tweede `celery-beat` verstuurt niets dubbel. Web en worker schalen dan wel samen op.

## Instance toevoegen

Neem een instance op onder `openNotificatiesServices` in de configuratie van de omgeving:

```ts
openNotificatiesServices: [{
  id: 'sociaal-domein-open-notificaties',
  subdomain: 'sociaal-domein-open-notificaties',
  databaseName: 'sociaal-domein-open-notificaties',
  image: 'openzaak/open-notificaties:1.16.2',
  logLevel: 'INFO',
  loadbalancerPriority: 110,
  redisCacheDatabaseNumber: 20,
  redisCeleryDatabaseNumber: 21,
}],
```

Er is geen validatie: controleer zelf in de configuratie van de omgeving dat

- `loadbalancerPriority` nergens anders gebruikt wordt (een dubbele prioriteit laat de deployment falen);
- de Redis database nummers nergens anders gebruikt worden, ook niet door de vaste nummers in `MainStack.ts` (een dubbel nummer gaat niet fout, maar deelt dan cache of queue met een andere service). Het maximum is 111.

## Handmatige stappen na de eerste deployment

### 1. Superuser

Via ECS Exec in de `web` container:

```sh
python src/manage.py createsuperuser
```

### 2. Koppeling met Open Zaak

Volg de [Open Notificaties documentatie](https://open-notificaties.readthedocs.io/en/latest/installation/configuration/opennotifs_config.html). In het kort:

1. In Open Notificaties: maak onder *Configuratie > Services* een service voor de Autorisaties API van de Open Zaak (`https://{open-zaak-subdomain}.{hostedzone}/autorisaties/api/v1/`, type ZGW client ID + secret) en kies die onder *Autorisatiecomponentconfiguratie*.
2. Leg onder *API autorisaties* de client ID en secret vast waarmee Open Zaak bij Open Notificaties komt.
3. In Open Zaak: maak applicaties voor de client van Open Notificaties (Autorisaties API lezen) en de client van Open Zaak (notificaties publiceren).
4. In Open Zaak: maak een service voor de Notificaties API (`https://{subdomain}.{hostedzone}/api/v1/`) en kies die onder de notificatie configuratie. Zet daarna `disableNotifications: false` in de Open Zaak configuratie.
5. Registreer de kanalen van Open Zaak in Open Notificaties, bijvoorbeeld via ECS Exec in Open Zaak: `python src/manage.py register_kanalen`.

### 3. Abonnementen

Abonnees (bijv. corsa-zgw, OMC) maak je aan onder *Notificaties > Abonnementen*, of de abonnee maakt die zelf aan via de API.

## Upgraden

Pas `image` aan in de configuratie. De `web` container draait de migraties bij het starten; `celery` en `celery-beat` wachten daarop. Lees wel de release notes, zie ook [OpenNotificaties-upgrade](./OpenNotificaties-upgrade.md).
