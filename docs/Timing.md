# Opties voor timing probleem

## Wachten met status toevoegen
- Taakapplicatie wacht een tijdje met toevoegen status tot openklant gevuld is.
- Nadeel: Zorgt voor logica en state in taak applicatie.

## Retry in OpenNotificaties
- Dit kan met een delay worden geconfigureerd

## Queue service 
- Variatn 1: Service die bericht vast houd tot er een notificatie van de vul service komt dat er gevuld is
- Variant 2: Een aflever delay

## Event driven
- Vul service publiceert event waar taak applicatie op geabboneerd is.
- Nadeel: Zorgt voor logica & state in taak applicatie.

