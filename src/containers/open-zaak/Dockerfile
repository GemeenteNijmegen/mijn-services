# Very simple build file
# Take tha base image we are running anyway and add the configuration file
# Set the entrypoint to a script that:
# 1. Resolves env variables in the YAML file
# 2. Calles the setup_configuration.sh script (provided by container)
ARG OPEN_ZAAK_IMAGE
FROM ${OPEN_ZAAK_IMAGE}
COPY ./setup_configuration.yaml /setup_configuration.yaml 
COPY ./entrypoint.sh /custom_entrypoint.sh
ENTRYPOINT ['/custom_entrypoint.sh']