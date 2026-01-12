# Open Product specific documentation

The current goals are expiremental. It will only be deployed on acc.


## Open Product release notes
- https://github.com/maykinmedia/open-product/blob/master/CHANGELOG.rst


## Setup configuration

To setup the configuration:
1. mount config file to /app/setup_configuration
2. Run `sh -c "/setup_configuration.sh && /load_upl.sh"`

When using a UPL this can be maintaned in version control as well

Maybe we should set env: 

```
      RUN_SETUP_CONFIG: ${RUN_SETUP_CONFIG:-true}
      LOAD_UPL: ${LOAD_UPL:-true}
``

See https://github.com/maykinmedia/open-product/blob/master/docker-compose.yml#L60


I think we can run the configuration by doing: `src/manage.py setup_configuration --yaml-file /app/setup_configuration/configuration.yaml`


Misschien moeten we hier ook nog wat mee: `src/manage.py migrate`