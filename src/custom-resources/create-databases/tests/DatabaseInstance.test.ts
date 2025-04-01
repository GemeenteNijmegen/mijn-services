import { environmentVariables } from "@gemeentenijmegen/utils";
import { Pool } from "pg";
import format from "pg-format";
import { DatabaseInstance } from "../DatabaseInstance";

const dbs: { 
  [key: string]: string
} = {
  nonexistent: 'nonexistent',
  new_empty: 'new_empty'
};

const describeIntegration = process.env.JEST_INTEGRATION_TESTS == 'true' ? describe : xdescribe;
describeIntegration('Database connection', () => {
  test('Setting up instance succeeds', async() => {
    const instance = new DatabaseInstance(dbConfig());
    expect(instance.connected).toBeTruthy();
  });
  
});
describeIntegration('Integration tests for database config', () => {
  
  let instance: DatabaseInstance;
  let pool: Pool;
  beforeAll(() => {
    instance = new DatabaseInstance(dbConfig());
    expect(instance.connected).toBeTruthy();

  })

  beforeEach(async() => {
    pool = new Pool(dbConfig());
    for(let dbKey in dbs) {
      const dbname = dbs[dbKey];
      const userExists = await pool.query(format('SELECT 1 FROM pg_roles WHERE rolname=%L', dbname));
      const databaseExists = await instance.databaseExists(dbname);
      if(userExists.rowCount !== 0 && databaseExists) {
        console.debug('dropping user', dbname);
        await pool.query(format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON TABLES FROM %I', dbname, dbname));
        await pool.query(format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I', dbname, dbname));
        await pool.query(format('REVOKE ALL PRIVILEGES ON DATABASE %I FROM %I', dbname, dbname));
        console.debug('revoked privileges for', dbname);
        await pool.query(format('DROP ROLE IF EXISTS %I', dbname));
        console.debug('dropped role', dbname);
      }
      await pool.query(format('DROP DATABASE IF EXISTS %I', dbs[dbKey]));
    }
  }); 

  afterEach(() => {
    pool.end();
  });

  afterAll(async () => {
    await instance.close();
  });

  test('Getting non-existent database returns false', async() => {
    const dbExists = await instance.databaseExists(dbs.nonexistent);
    expect(dbExists).toBeFalsy();
  });


  test('Creating database succeeds', async() => {
    const dbExists = await instance.databaseExists(dbs.new_empty);
    expect(dbExists).toBeFalsy();
    await instance.createDatabase(dbs.new_empty);
    const dbExistsAfterCreation = await instance.databaseExists(dbs.new_empty);
    expect(dbExistsAfterCreation).toBeTruthy();
  });

  test('Nonexisting user returns false', async() => {
    const userExists = await instance.userExists('somenewuser');
    expect(userExists).toBeFalsy();
  });

  test('Creating user in existing database succeeds', async() => {
    const userExists = await instance.userExists(dbs.new_empty);
    expect(userExists).toBeFalsy();
    
    await instance.createDatabase(dbs.new_empty);
    await instance.createUserWithAccessToDb(dbs.new_empty);
    const userExistsAfterCreation = await instance.userExists(dbs.new_empty);
    expect(userExistsAfterCreation).toBeTruthy();
  });
});



function dbConfig(env?: { [x: string]: string; }): { user: string; password: string; host: string; port: number; database: string; } {
  if(!env) { 
    env = environmentVariables(['DB_USER', 'DB_HOST', 'DB_PORT', 'DB_NAME']);
  }
  return {
    user: env.DB_USER,
    password: process.env.DB_PASSWORD!,
    host: env.DB_HOST,
    port: parseInt(env.DB_PORT),
    database: env.DB_NAME,
  };
}

