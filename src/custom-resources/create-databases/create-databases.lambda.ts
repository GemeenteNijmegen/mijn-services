import { AWS } from '@gemeentenijmegen/utils';
import { CdkCustomResourceEvent } from 'aws-lambda';
import { DatabaseInstance } from './DatabaseInstance';

export async function handler(event: CdkCustomResourceEvent) {
  console.log(JSON.stringify(event));

  if (event.RequestType == 'Delete') {
    console.error('Delete events are not implemented for this custom resource! You\'ll have to manually delete the databases');
    return;
  }

  // setup db connection
  const credentialsObj = await AWS.getSecret(process.env.DB_CREDENTIALS_ARN!);
  const credentials = JSON.parse(credentialsObj);

  const instance = new DatabaseInstance({
    user: credentials.username,
    password: credentials.password,
    host: process.env.DB_HOST!,
    port: parseInt(process.env.DB_PORT!),
    database: process.env.DB_NAME!,
  })
  
  // Check if databases exist otherwise create them
  const listOfDatabases = event.ResourceProperties.listOfDatabases;
  console.log('Found list of databases', listOfDatabases);
  const databases = listOfDatabases.split(',');
  for (const database of databases) {
    const exists = await instance.databaseExists(database);
    if (!exists) {
      console.info('Creating database', database);
      await instance.createDatabase(database);
    } else {
      console.info('Database', database, 'already exists... skipping creation.');
    }

    // TODO: Add user for this db if it hasn't been created yet
    if(!instance.userExists(database)) {
      console.info('No user exists for database', database);
    }
  }
}
