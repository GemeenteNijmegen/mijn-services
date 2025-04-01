Database toegang:

- Maak de DB (als die nog niet bestaat)
- **Login op die DB** als superuser

```
GRANT ALL PRIVILEGES ON DATABASE testdb TO testuser3;

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO testuser3; -- bestaande tabellen
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO testuser3; -- bestaande sequences

ALTER DEFAULT PRIVILEGES FOR ROLE testuser3 IN SCHEMA public GRANT ALL ON TABLES TO testuser3; --nieuwe tabellen
ALTER DEFAULT PRIVILEGES FOR ROLE testuser3 IN SCHEMA public GRANT ALL ON SEQUENCES TO testuser3; --nieuwe sequences
```

Rol verwijderen (incompleet):
ALTER DEFAULT PRIVILEGES FOR ROLE <rol> IN SCHEMA public REVOKE ALL ON TABLES FROM <rol>
ALTER DEFAULT PRIVILEGES FOR ROLE <rol> IN SCHEMA public REVOKE ALL ON SEQUENCES FROM <rol>
REVOKE ALL PRIVILEGES ON DATABASE <database> FROM <rol>
