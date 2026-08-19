ARG BASE_IMAGE=ritense/gzac-backend:13.41.0
FROM ${BASE_IMAGE}

# Deploy PBAC role and permission configuration files.
# The GZAC backend image ships with roles defined but no permissions,
# which causes all API requests to get 403 Forbidden from PBAC.
# These files are picked up by Valtimo's GlobalRoleImporter and
# GlobalPermissionImporter at startup via classpath scanning.
COPY config/global/role/ /app/resources/config/global/role/
COPY config/global/permission/ /app/resources/config/global/permission/
