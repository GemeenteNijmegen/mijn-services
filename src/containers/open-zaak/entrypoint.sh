# Replace environment variables in yaml file and write it to a writable location
envsubst < setup_configuration.yaml > /app/setup_configuration/data.yaml

# Call the setup configuration script
/setup_configuration.sh

# Setup kanalen that we are expecting
python src/manage.py register_kanalen