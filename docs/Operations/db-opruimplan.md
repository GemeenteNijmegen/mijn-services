psql -h $ENDPOINT -U mijn_services -d postgres;

ALTER DATABASE "db_corsa-zgw-dev" OWNER TO "mijn_services";
ALTER DATABASE "db_objects" OWNER TO "mijn_services";
ALTER DATABASE "db_gzac" OWNER TO "mijn_services";
ALTER DATABASE "db_keycloak" OWNER TO "mijn_services";
ALTER DATABASE "db_objecttypes" OWNER TO "mijn_services";
ALTER DATABASE "db_open-klant" OWNER TO "mijn_services";
ALTER DATABASE "db_open-notificaties" OWNER TO "mijn_services";
ALTER DATABASE "db_open-product" OWNER TO "mijn_services";
ALTER DATABASE "db_open-zaak" OWNER TO "mijn_services";

DROP DATABASE "db_objects";
DROP DATABASE "db_corsa-zgw-dev";
DROP DATABASE "db_gzac";
DROP DATABASE "db_keycloak";
DROP DATABASE "db_objecttypes";
DROP DATABASE "db_open-klant";
DROP DATABASE "db_open-notificaties";
DROP DATABASE "db_open-product";
DROP DATABASE "db_open-zaak";
