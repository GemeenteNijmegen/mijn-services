import { AWS } from '@gemeentenijmegen/utils';
import { CdkCustomResourceEvent } from 'aws-lambda';
import * as postgres from 'pg';

export async function handler(event: CdkCustomResourceEvent) {
  console.log(JSON.stringify(event));

  if (event.RequestType == 'Delete') {
    console.error('Delete events are not implemented for this custom resources! You\'ll have to manually delete the databases');
    return;
  }

  // setup db connection
  const credentialsObj = await AWS.getSecret(process.env.DB_CREDENTIALS_ARN!);
  const credentials = JSON.parse(credentialsObj);

  // Check if databases exist otherwise create them
  const listOfDatabases = event.ResourceProperties.listOfDatabases;
  console.log('Found list of databases', listOfDatabases);
  const databases = listOfDatabases.split(',');
  for (const database of databases) {
    const client = new postgres.Client({
      user: database, // Use the database name as the user name
      password: credentials.password,
      host: process.env.DB_HOST!,
      port: parseInt(process.env.DB_PORT!),
      database: database,
    });
    await client.connect();
    const exists = await existsDatabase(client, database);
    if (!exists) {
      console.info('Creating database', database);
      await createDatabase(client, database);
    } else {
      console.info('Database', database, 'already exists... skipping creation.');
    }
  }

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