# Very simple build file
# Take tha base image we are running anyway and add the configuration file
# Set the entrypoint to a script that:
# 1. Resolves env variables in the YAML file
# 2. Calles the setup_configuration.sh script (provided by container)
ARG OPEN_NOTIFICATIES_IMAGE=openzaak/open-notificaties:latest
FROM ${OPEN_NOTIFICATIES_IMAGE}
COPY ./setup_configuration.yaml /setup_configuration.yaml 
COPY ./entrypoint.sh /custom_entrypoint.sh
CMD '/custom_entrypoint.sh'



# Required env vars
#OPEN_ZAAK_BASE_URL=https://mijn-services.accp.nijmegen.nl/open-zaak
#OPENNOTIFICATIES_DOMAIN=mijn-services.accp.nijmegen.nl
#NOTIF_OPENZAAK_CLIENT_ID # Notificaties -> open zaak
#NOTIF_OPENZAAK_SECRET # Notificaties -> open zaak
#OPENZAAK_NOTIF_CLIENT_ID # Open-zaak -> notificaties
#OPENZAAK_NOTIF_SECRET # Open-zaak -> notificaties