# Object Notificatie Service
Deze service is verantwoordelijk voor het verwerken van notificaties op verlopen
objecten (lees: taken). De service wordt aangeroepen op basis van een 
tijdschema, een objectconfiguratie en een notificatie-configuratie. Het maakt 
gebruik van de [object-notifier](https://www.npmjs.com/package/@gemeentenijmegen/object-notifier)
package voor [logica](https://github.com/GemeenteNijmegen/modules-object-notifier).

De runtime-configuratie is op basis van de [config-package](https://www.npmjs.com/package/@gemeentenijmegen/config),
de frequentie van uitvoer wordt bepaald door de applicatie-configuratie 
(Configuration.ts), en geïmplementeerd door een Eventbridge-rule.

To create a service that triggers daily:
```
new ObjectNotificatieService(this, 'objectnotificaties', {
  schedule: Schedule.rate(Duration.days(1)
  config: 
});
```
