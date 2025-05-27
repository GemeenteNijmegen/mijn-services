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

  const client = new postgres.Client({
    user: credentials.username,
    password: credentials.password,
    host: process.env.DB_HOST!,
    port: parseInt(process.env.DB_PORT!),
    database: process.env.DB_NAME,
  });
  await client.connect();

  // Check if databases exist otherwise create them
  const listOfDatabases = event.ResourceProperties.listOfDatabases;
  console.log('Found list of databases', listOfDatabases);
  const databases = listOfDatabases.split(',');
  for (const database of databases) {
    const exists = await existsDatabase(client, database);
    if (!exists) {
      console.info('Creating database', database);
      await createDatabase(database, credentials);
    } else {
      console.info('Database', database, 'already exists... skipping creation.');
    }
  }

}


async function existsDatabase(client: postgres.Client, name: string) {
  const resp = await client.query(`SELECT datname FROM pg_catalog.pg_database WHERE datname = '${name}';`);
  return resp.rowCount !== 0;
}

async function createDatabase(databaseName: string, credentials: any) {
  try {
    // Create a new client for the target database
    const client = new postgres.Client({
      user: credentials.username,
      password: credentials.password,
      host: process.env.DB_HOST!,
      port: parseInt(process.env.DB_PORT!),
      database: databaseName,
    });

    await client.connect();
    await client.query(`CREATE DATABASE "${databaseName}";`);
    await client.end();
  } catch (err) {
    console.error(err);
    throw Error(`Could not create database ${databaseName}`);
  }
}