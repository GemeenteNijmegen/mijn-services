# Caveats

De hard coded API-Version header in cloudfront wordt geset omdat dit niet door de open-zaak container wordt gedaan.
We gaan hier voor nu mee om door de header te laten staan en na de upgrade wordt deze wel door open-zaak gezet en kunnen we 'm uit cloudfront verwijderen.
Dit hebben we getest met de nieuwste versie van open-zaak, hierin wordt de API-Version header wel altijd mee gestuurd.


## TODOs
TODO: Healthcehck grace period op 5 minuten zetten, dan kan de migratie rustig doorlopen voor de container wordt afgeschoten

TODO: Uitzoeken SITE_DOMAIN environment variable nodig voor starten main conainer (open-zaak heeft deze nodig, open-notificaites niet)
