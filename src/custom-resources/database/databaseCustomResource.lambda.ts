import * as utils from '@gemeentenijmegen/utils';
import { CdkCustomResourceEvent, CdkCustomResourceResponse } from 'aws-lambda';
import * as postgres from 'pg';

/**
 * Environment variables required:
 * - ADMIN_CREDENTIALS_ARN: ARN of the secret containing { username, password } for the admin user
 * - DB_USER_CREDENTIALS_ARN: ARN of the secret containing { username, password } for the new db user
 * - DB_HOST: RDS instance hostname
 * - DB_PORT: RDS instance port
 * - DB_ADMIN_DATABASE: existing database to connect to (e.g. 'postgres')
 * - DB_NAME: name of the database to create
 */
export async function handler(event: CdkCustomResourceEvent): Promise<CdkCustomResourceResponse> {
  console.log(JSON.stringify(event));

  const dbName = process.env.DB_NAME!;

  if (event.RequestType === 'Delete') {
    const removalPolicy = (event.ResourceProperties.RemovalPolicy ?? 'retain').toLowerCase();
    console.info(`Delete event received for database '${dbName}'. Removal policy: '${removalPolicy}'.`);

    if (removalPolicy !== 'destroy') {
      console.warn(`Removal policy is '${removalPolicy}'. Database '${dbName}' and its user will not be deleted. Manual cleanup required if needed.`);
      return response('SUCCESS', event, dbName, `Database '${dbName}' retained — removal policy is '${removalPolicy}'.`);
    }

    console.info('Removal policy is DESTROY. Proceeding with deletion...');
    const adminClient = await buildAdminClient();
    try {
      await adminClient.connect();
      const dbUserCredentials = await fetchCredentials(process.env.DB_USER_CREDENTIALS_ARN!);
      const dbUsername = dbUserCredentials.username;

      await terminateConnections(adminClient, dbName);
      await dropDatabase(adminClient, dbName);
      await dropUser(adminClient, dbUsername);

      return response('SUCCESS', event, dbName, `Database '${dbName}' and user '${dbUsername}' deleted.`);
    } catch (err) {
      console.error('Error during database deletion:', err);
      return response('FAILED', event, dbName, `Error: ${(err as Error).message}`);
    } finally {
      await adminClient.end();
    }
  }

  const adminClient = await buildAdminClient();

  try {
    await adminClient.connect();

    const dbUserCredentials = await fetchCredentials(process.env.DB_USER_CREDENTIALS_ARN!);
    const dbUsername = dbUserCredentials.username;
    const dbUserPassword = dbUserCredentials.password;

    // Ensure user exists with correct password
    await ensureUser(adminClient, dbUsername, dbUserPassword);

    // Create database if it doesn't exist
    const exists = await databaseExists(adminClient, dbName);
    if (!exists) {
      console.info(`Database '${dbName}' does not exist. Creating...`);
      await createDatabase(adminClient, dbName, dbUsername);
      console.info(`Database '${dbName}' created successfully.`);
    } else {
      console.info(`Database '${dbName}' already exists. Skipping creation.`);
    }

    const adminCredentials = await fetchCredentials(process.env.ADMIN_CREDENTIALS_ARN!);
    await setupDatabasePermissions(adminCredentials, dbName, dbUsername);

    return response('SUCCESS', event, dbName, `Database '${dbName}' is ready.`);

  } catch (err) {
    console.error('Error during database provisioning:', err);
    return response('FAILED', event, dbName, `Error: ${(err as Error).message}`);

  } finally {
    await adminClient.end();
  }
}

// --- Connection setup ---

async function buildAdminClient(): Promise<postgres.Client> {
  const credentials = await fetchCredentials(process.env.ADMIN_CREDENTIALS_ARN!);
  return new postgres.Client({
    user: credentials.username,
    password: credentials.password,
    host: process.env.DB_HOST!,
    port: parseInt(process.env.DB_PORT!),
    // Connect to the default admin database, not the one we're creating
    database: process.env.DB_ADMIN_DATABASE ?? 'postgres',
    ssl: { rejectUnauthorized: false }, // in internal VPC, control both services.
  });
}

async function fetchCredentials(secretArn: string): Promise<{ username: string; password: string }> {
  const raw = await utils.AWS.getSecret(secretArn);
  const parsed = JSON.parse(raw);
  if (!parsed.username || !parsed.password) {
    throw new Error(`Secret ${secretArn} does not contain expected username/password fields.`);
  }
  return parsed;
}

// --- Database operations ---

async function databaseExists(client: postgres.Client, name: string): Promise<boolean> {
  const result = await client.query(
    'SELECT 1 FROM pg_catalog.pg_database WHERE datname = $1',
    [name],
  );
  return (result.rowCount ?? 0) > 0;
}

async function createDatabase(client: postgres.Client, name: string, owner: string): Promise<void> {
  // DDL statements don't support parameterized queries in PostgreSQL.
  // Sanitize identifiers explicitly.
  const safeName = sanitizeIdentifier(name);
  const safeOwner = sanitizeIdentifier(owner);
  try {
    await client.query(`CREATE DATABASE "${safeName}" OWNER "${safeOwner}";`);
  } catch (err) {
    console.error(`Failed to create database '${name}':`, err);
    throw new Error(`Could not create database '${name}'.`);
  }
}

async function ensureUser(client: postgres.Client, username: string, password: string): Promise<void> {
  // Uses DO block to conditionally create or update the user.
  // Password is passed as a parameterized literal via format(),
  // but pg doesn't support params in DO blocks — so we use a
  // dedicated helper query instead to set the password safely.
  const safeUsername = sanitizeIdentifier(username);

  // Step 1: create user if not exists (no password yet)
  await client.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT FROM pg_catalog.pg_roles WHERE rolname = '${safeUsername}'
      ) THEN
        CREATE USER "${safeUsername}";
      END IF;
    END
    $$;
  `);

  // Step 2: set/update password via ALTER USER — password value is parameterized
  // Note: ALTER USER does not support $1 syntax for the password value,
  // but we can use format() from within postgres — or use a workaround.
  // Safest approach: use client.query with a prepared ALTER, with password escaped manually.
  // PostgreSQL does not support bind parameters for ALTER USER ... PASSWORD.
  // We escape the password string explicitly.
  await client.query(`ALTER USER "${safeUsername}" WITH PASSWORD ${escapeLiteral(password)};`);

  // Step 3: grant admin membership in the new role
  // Required so admin can SET ROLE to that user when creating a database with that owner
  await client.query(`GRANT "${safeUsername}" TO CURRENT_USER;`);

  console.info(`User '${username}' is ready.`);
}

async function setupDatabasePermissions(
  adminCredentials: { username: string; password: string },
  dbName: string,
  dbUsername: string,
): Promise<void> {
  const safeDbName = sanitizeIdentifier(dbName);
  const safeUsername = sanitizeIdentifier(dbUsername);

  // Connect to the new database specifically
  const dbClient = new postgres.Client({
    user: adminCredentials.username,
    password: adminCredentials.password,
    host: process.env.DB_HOST!,
    port: parseInt(process.env.DB_PORT!),
    database: safeDbName,
    ssl: { rejectUnauthorized: false },
  });

  await dbClient.connect();
  try {
    // Grant all schema privileges to the db user
    await dbClient.query(`GRANT ALL ON SCHEMA public TO "${safeUsername}";`);
    // Make litellm user the schema owner (cleanest solution)
    await dbClient.query(`ALTER SCHEMA public OWNER TO "${safeUsername}";`);
    // Ensure future objects are accessible
    await dbClient.query(`ALTER DATABASE "${safeDbName}" OWNER TO "${safeUsername}";`);
    console.info(`Permissions set up for '${dbUsername}' on database '${dbName}'.`);
  } finally {
    await dbClient.end();
  }
}

async function terminateConnections(client: postgres.Client, dbName: string): Promise<void> {
  const safeName = sanitizeIdentifier(dbName);
  // Terminate all active connections to the database before dropping it.
  // pg_terminate_backend returns false for connections that couldn't be terminated — those are logged.
  await client.query(`
    SELECT pg_terminate_backend(pid)
    FROM pg_stat_activity
    WHERE datname = '${safeName}'
      AND pid <> pg_backend_pid();
  `);
  console.info(`Terminated active connections to '${dbName}'.`);
}

async function dropDatabase(client: postgres.Client, dbName: string): Promise<void> {
  const safeName = sanitizeIdentifier(dbName);
  const exists = await databaseExists(client, dbName);
  if (!exists) {
    console.info(`Database '${dbName}' does not exist. Skipping drop.`);
    return;
  }
  try {
    await client.query(`DROP DATABASE "${safeName}";`);
    console.info(`Database '${dbName}' dropped.`);
  } catch (err) {
    console.error(`Failed to drop database '${dbName}':`, err);
    throw new Error(`Could not drop database '${dbName}'.`);
  }
}

async function dropUser(client: postgres.Client, username: string): Promise<void> {
  const safeUsername = sanitizeIdentifier(username);
  try {
    await client.query(`DROP OWNED BY "${safeUsername}";`);
    await client.query(`DROP USER IF EXISTS "${safeUsername}";`);
    console.info(`User '${username}' dropped.`);
  } catch (err) {
    console.error(`Failed to drop user '${username}':`, err);
    throw new Error(`Could not drop user '${username}'.`);
  }
}
// --- Sanitization helpers ---

/**
 * Sanitizes a PostgreSQL identifier (database name, username).
 * Rejects anything that isn't alphanumeric or underscores to prevent injection in DDL.
 * Adjust the regex if your naming convention requires hyphens or other characters.
 */
function sanitizeIdentifier(value: string): string {
  if (!/^[a-zA-Z0-9_]+$/.test(value)) {
    throw new Error(`Invalid identifier: '${value}'. Only alphanumeric characters and underscores are allowed.`);
  }
  return value;
}

/**
 * Escapes a string value for safe use as a PostgreSQL literal.
 * Used specifically for passwords in ALTER USER, where bind parameters aren't supported.
 * Replaces single quotes with doubled single quotes (standard SQL escaping).
 */
function escapeLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

// --- CDK response helper ---

function response(
  status: 'SUCCESS' | 'FAILED',
  event: CdkCustomResourceEvent,
  dbName: string,
  reason: string,
): CdkCustomResourceResponse {
  return {
    Status: status,
    Reason: reason,
    PhysicalResourceId: `db-${dbName}`,
    StackId: event.StackId,
    RequestId: event.RequestId,
    LogicalResourceId: event.LogicalResourceId,
  };
}