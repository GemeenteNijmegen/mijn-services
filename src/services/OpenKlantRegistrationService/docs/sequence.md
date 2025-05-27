
# Strategy: Partij per zaak using form data

Gist: registration service wordt 2 keer getriggered door het verwijderen en opnieuw aanmaken van de rol. De 1e keer wordt de partij aangemaakt de 2e keer wordt de bestaande partij gevuld met email/telefoon en voorkeur.

```mermaid
sequenceDiagram
  participant VIP
  participant OpenZaak
  participant Objecten API
  participant Notificaties
  participant RegistratieService
  participant OpenKlant
  participant SubmissionStorage
  participant OMC
  participant NotifyNL


  Note over OpenZaak, NotifyNL: Notificatie: Rol aangemaakt bij zaak

  VIP ->> OpenZaak: Registreren zaak (incl. status, rol etc.)
  OpenZaak ->> Notificaties: Publish: Rol Create
  Notificaties ->> RegistratieService: Subscribed: Rol Create
  activate RegistratieService
  RegistratieService ->> OpenKlant: Create partij
  RegistratieService ->> OpenKlant: Create partij identificatie
  RegistratieService ->> OpenZaak: Delete rol (update part 1)
  RegistratieService ->> OpenZaak: Create rol (update part 2) (incl. partij url)
  deactivate RegistratieService


  Note over OpenZaak, NotifyNL: Notificatie: Rol opnieuw aangemaakt (delete & create)

  OpenZaak ->> Notificaties: Publish: Rol Create
  Notificaties ->> RegistratieService: Subscribed: Rol Create
  activate RegistratieService
  RegistratieService ->> OpenZaak: GET rol
  RegistratieService ->> OpenZaak: GET Zaak
  RegistratieService ->> OpenKlant: GET Partij (uuid/url from rol)
  RegistratieService ->> SubmissionStorage: GET Formulier data
  RegistratieService ->> OpenKlant: POST digitaalAdress (telefoonnummer)
  RegistratieService ->> OpenKlant: POST digitaalAdress (email)
  RegistratieService ->> OpenKlant: PATCH partij (set voorkeurskanaal)
  deactivate RegistratieService


  Note over OpenZaak, NotifyNL: Notificatie: Taak aangemaakt (in objecten API)

  VIP ->> Objecten API: Aanmaken taak
  Objecten API ->> Notificaties: Publish: Object create
  Notificaties ->> OMC: Subscribed: Object create
  OMC ->> OpenKlant: get partij (incl. digitale adressen)
  OMC ->> NotifyNL: Send notification


```