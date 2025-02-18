# Deployment info
De meeste infra wordt automatisch gegenereerd door cloudformation.
We kunnen alleen niet alles helemaal automatiseren door de configuratie van de containers.
Daarom is er voor elke van de volgende services een scheduled ECS Task aangemaakt:
- Objects
- Objecttypes
- OpenKlant
- OpenNotificaties
- OpenZaak
Dit zijn allemaal containers van Maykin. Deze ECS Tasks hebben een cron ingesteld op 2020 bij deployment. 
Deze kan hantmatig aangepast worden (in de console...) om de configuratie taak te schedulen.


Voor een aantal containers is dit beperkt tot het maken van een superuser door het volgende commando te draaien:
```
python src/manage.py createsuperuser
```
Dit gaat om de containers: objects, objecttypes en OpenKlant

## Open notificaties
Voor OpenNotificaties is er een nieuwe opzet in gebruik (iets met een configuratie file). 
[Zie hier voor een voorbeeld](https://github.com/open-zaak/open-notificaties/blob/main/docker/setup_configuration/data.yaml). 
Ik heb dit nog niet aan de praat gekregen, de configuratie wordt daarom met de hand gedaan.


## Open zaak
Open zaak maakt nog niet gebruik van dezelfde configuratie file als open notificaties. 
Hiervoor wordt het setup_configuration script in de container gedraaid.