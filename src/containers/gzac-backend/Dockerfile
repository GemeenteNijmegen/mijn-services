ARG BASE_IMAGE=ritense/gzac-backend:13.41.0

# Name the base image so we can COPY from it
FROM ${BASE_IMAGE} AS base

# Stage 1: Use zip to inject the permission file into the WAR without touching MANIFEST.MF
FROM alpine:3.20 AS builder
RUN apk add --no-cache zip
COPY --from=base /app.war /app.war
COPY config/pbac/all.permission.json /tmp/WEB-INF/classes/config/pbac/all.permission.json

# 'zip' adds/updates files in the archive without altering existing entries like MANIFEST.MF
RUN cd /tmp && zip /app.war WEB-INF/classes/config/pbac/all.permission.json

# Stage 2: Use the original base image with the modified WAR
FROM base

# Deploy PBAC permission configuration files.
# The GZAC backend WAR ships with roles defined (WEB-INF/classes/config/pbac/all.role.json)
# but no permissions, causing all API requests to get 403 Forbidden from PBAC.
#
# The PermissionDeployer scans classpath*:**/*.permission.json at startup and
# deploys permissions into the database. With VALTIMO_CHANGELOG_PBAC_CLEAR_TABLES=true,
# the permission table is cleared and repopulated on each startup.
COPY --from=builder /app.war /app.war
