# Replacing environment variables in yaml file and write it to a writable location
echo "Replacing environment variables in yaml file and write it to a writable location"
mkdir -p /app/setup_configuration
envsubst < /setup_configuration.yaml > /app/setup_configuration/data.yaml

# Call the setup configuration script
echo "Running setup configuration script from base image"
# cat /app/setup_configuration/data.yaml
/setup_configuration.sh