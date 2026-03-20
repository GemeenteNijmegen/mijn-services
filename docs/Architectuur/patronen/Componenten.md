# Mapping: mijn-services, APIs en Componenten
In dit document:
- Lijst van Mijn-Services
- Lijst van APIs waarop Mijn-Services gebaseerd worden
- Lijst van componenten die deze APIs impelmenteren

Oftewel:
- Mijn-Services zijn dus abstract en gaan o.a. ook over gebruikersonderzoeken met inwoners
- De APIs zijn daar een technische vertaling van
- De componenten is de daadwerklijke software die hier iets mee doet.

## De Mijn-Services
Een lijst van de productie ready mijn-services:
- MijnZaken
- MijnTaken
- MijnBerichten
- Notificatieservice
- MijnContactmomenten
- MijnProfiel
- MijnProducten

Wat er ook bij hoort: 
- Verzoeken / aanvragen (formulieren die worden ingediend)
- Archiveren
- Publiceren

Wat er nog aan komt:
- Mijn Acties
- Mijn Plan
- Mijn Afspraken
- Mijn Dossier


## De APIs

De events om alles aan elkaar te knopen: Notificaties API

**MijnZaken**
- APIs: 
  - ZGW APIs (kunnen niet los van elkaar worden gezien) (verklaard tot standaard)
    - Catalogi API (beschrijft zaaktypen, documenttypen, besluittypenb, relaties etc.)
    - Zaken API
    - Besluiten API
    - Documenten API
    - Autorisaties API

**MijnTaken**
- APIs: Taken API

**MijnBerichten**
- APIs: Berichten API

**Notificatieservice**
- APIs: NotifyNL API (fork van bekende project in de UK)

**MijnContactmomenten**
- APIs: Klantcontact API

**MijnProfiel**
- APIs: Klantcontact API

**MijnProducten**
- APIs: Producten API, Producttypen API

**Verzoeken**
- APIs: Verzoeken API, Verzoektypen API

**Archiveren**
- APIs: Duurzame toegankelijkheidseisen?
- Opmerking: Volgens mij is dit niet een API of iets dat in een component te vangen is. de losse componenten/patronen/APIs moeten hieraan voldoen.

**Publiceren**
- APIs: ??(naar welke applicatie / API gaat dit)
- Opmerking: Volgens mij is dit niet een API of iets dat in een component te vangen is. de losse componenten/patronen/APIs moeten hieraan voldoen.



## De componenten

| Component            | APIs                                                                                 | Opmerking                               |
|----------------------|--------------------------------------------------------------------------------------|-----------------------------------------|
| OpenZaak             | ZGW APIs: zaken(typen), besluiten(typen), documenten(typen), authorisaties, catalogi | Maykin component                        |
| OneGround            | ZGW APIs: zaken(typen), besluiten(typen), documenten(typen), authorisaties, catalogi | RxMission (alleen als SaaS)             |
|                      |                                                                                      |                                         |
| OpenVTB              | Verzoeken, Verzoektype, Taken, Berichten                                             | Maykin, nog in ontwikkeling             |
|                      |                                                                                      |                                         |
| Inwoner Notificaties | NotifyNL (van Worth)                                                                 | Landelijke notificatie verstuur service |
|                      |                                                                                      |                                         |
| OpenKlant            | Klantinteracties API                                                                 | Maykin component                        |
|                      |                                                                                      |                                         |
| OpenProduct          | Producten API, Producttypen API                                                      | Maykin component                        |
  


### Notificaties API (systeem events)
Note: Dit gaat over interne systeem events. Dit is dus niet de notificatieservice voor inwoners (deze API heeft een hele ongelukkige naam)

Al deze componenten maken gebruik van een notificaties API. Hierop worden volgens de Notificaties API standaard events gepubiliceerd.
Dit is nodig om componenten te laten werken.


### NotifyNL
NotifyNL heeft mogelijkheden om:
- Email, SMS
- Berichtenbox (mijn-overheid)
- Post (een partij die dit levert of aansluiten op eigen printstraat)

**OutputManagementComponent:** Dit component is ontwikkeld door NotifyNL om in het mijn-services eco systeem te staan. Het bevat alle logic om naar events te luisten (via de notificaties API) en vervolgens via NotifyNL de notificatie naar de inwoner te sturen.
- Het component haalt de juist gegevens op voor het samenstellen van de notificatie. O.a. uit de zaken & besluiten APIs of de Taken en Berichten APIs.
- Het bevraagt OpenKlant op de contactgegevens van een inwoner.
- Het registreert contactmomenten als de notificatie goed is gegaan (callback van NotifyNL (email afgeleverd, SMS afgeleverd, Bericht in Berichtenbox geaccepteerd)).


### Archiveren

Archiveren zou kunnen in de componenten mits deze goed zijn ingericht: 
- Zaken API = archief zaak informatie + documenten etc.
- Documenten API kan ook als DMS gebruikt worden zonder zaak informatie maar icm de Catalogi API om documenttypen vast te leggen.
  - Hierbij is raadpleging geregeld via de authorisatie component.


Bewaartertermijnen, vertrouwensniveaus zijn onderdeel van de ZGW standaarden (Zaken, Besluiten, Documenten APIs).



### Publiceren
Mijn-Services heeft geen faciliteiten voor het publiceren van informatie.

> [Gedachte]
>
> Wat ik mij als patroon kan voorstellen:
> - Luisten naar notificaties van de verschillende bronnen (via de Notificaties API)
>  - Relevantie notificatie (bijv een vergunning is verleend):
>    - Ophalen gegevens van vergunning (geanonymiseerd?)
>    - Doorsturen naar respectivelijk publicatie platform

