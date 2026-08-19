ARG BASE_IMAGE=ritense/gzac-backend:13.41.0

# Name the base image so we can COPY from it
FROM ${BASE_IMAGE} AS base

# Stage 1: Use a JDK image to inject the permission file into the WAR
FROM eclipse-temurin:21-jdk-alpine AS builder
COPY --from=base /app.war /app.war
COPY config/pbac/all.permission.json /tmp/all.permission.json

# Add permission file into the WAR's classpath (WEB-INF/classes/config/pbac/)
RUN mkdir -p /tmp/war && \
    cd /tmp/war && \
    jar xf /app.war && \
    cp /tmp/all.permission.json WEB-INF/classes/config/pbac/all.permission.json && \
    jar cf /app.war . && \
    rm -rf /tmp/war

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
