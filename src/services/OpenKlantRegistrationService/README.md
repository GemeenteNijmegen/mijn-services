# OpenKlantRegistrationService

Deze service registreert klant gegevens in open klant obv ZGW APIs en notificaties. We doen dit met het doel om het OMC te kunnen gebruiken en zo notificaties van zaak statusen (create, update, afgerond) en taken te kunnen sturen via NotifyNL.

Dit geeft de volgende componenten:
![Notificatie flow](./docs/notificaties-flow.drawio.png)


## Implementatie details
![Implementatie details](./docs/implementatie.drawio.png)

- De service is geimpmeenteerd in een lambda en wordt achter de API gateway van dit project gedeployed.
- Een nieuwe configuratie toevoegen gaat door het toevoegen van een nieuwe configuratie `OpenKlantRegistrationServiceConfiguration` in de [configuratie file](../../Configuration.ts).
- Er zijn verschillende strategien te configureren die gebruikt worden, dit gebeurt via een environment variabele: `STRATEGY`