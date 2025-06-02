import { AWS } from '@gemeentenijmegen/utils';
import { CdkCustomResourceEvent } from 'aws-lambda';
import * as postgres from 'pg';

export async function handler(event: CdkCustomResourceEvent) {
  console.log(JSON.stringify(event));

  if (event.RequestType == 'Delete') {
    console.error('Delete events are not implemented for this custom resources! You\'ll have to manually delete the databases');
    return;
  }

  // setup db connection as admin
  const credentialsObj = await AWS.getSecret(process.env.DB_CREDENTIALS_ARN!);
  const credentials = JSON.parse(credentialsObj);

  const adminClient = new postgres.Client({
    user: credentials.username,
    password: credentials.password,
    host: process.env.DB_HOST!,
    port: parseInt(process.env.DB_PORT!),
    database: process.env.DB_NAME,
  });
  await adminClient.connect();

  // Check if databases exist otherwise create them
  const listOfDatabases = event.ResourceProperties.listOfDatabases;
  console.log('Found list of databases', listOfDatabases);
  const databases = listOfDatabases.split(',');
  for (const database of databases) {
    // Ensure user exists
    await createUser(adminClient, database, credentials.password);

    // Connect as that user
    const client = new postgres.Client({
      user: database,
      password: credentials.password,
      host: process.env.DB_HOST!,
      port: parseInt(process.env.DB_PORT!),
      database: database,
    });
    await client.connect();

    const databaseName = 'db_' + database;
    const exists = await existsDatabase(client, databaseName);
    if (!exists) {
      console.info('Creating database', databaseName);
      await createDatabase(client, databaseName);
    } else {
      console.info('Database', databaseName, 'already exists... skipping creation.');
    }
    await client.end();
  }
  await adminClient.end();
}

async function existsDatabase(client: postgres.Client, name: string) {
  // The client needs CONNECT privilege on the server and access to the pg_catalog.pg_database table.
  // Typically, any user who can connect to the server can run this query, unless restricted by custom permissions.
  const resp = await client.query(`SELECT datname FROM pg_catalog.pg_database WHERE datname = '${name}';`);
  return resp.rowCount !== 0;
}

async function createDatabase(client: postgres.Client, name: string) {
  try {
    await client.query(`CREATE DATABASE "${name}";`);
  } catch (err) {
    console.error(err);
    throw Error(`Could not create database ${name}`);
  }
}

async function createUser(client: postgres.Client, username: string, password: string) {
  await client.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '${username}') THEN
        CREATE USER "${username}" WITH PASSWORD '${password}';
      ELSE
        ALTER USER "${username}" WITH PASSWORD '${password}';
      END IF;
    END
    $$;
  `);
}