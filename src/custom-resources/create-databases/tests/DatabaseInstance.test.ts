import { environmentVariables } from "@gemeentenijmegen/utils";
import { randomUUID } from "crypto";
import { DatabaseInstance } from "../DatabaseInstance";

const uuid = randomUUID();
const dbs: { 
  [key: string]: string
} = {
  nonexistent: `${uuid}_nonexistent`,
  new_empty: `${uuid}_new_empty`
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
  // let client: Client;
  beforeAll(async() => {
    instance = new DatabaseInstance(dbConfig());
    expect(instance.connected).toBeTruthy();

    // console.debug('1');
    // // const client = new Client(dbConfig());
    // console.debug('2');
    // for(let dbKey in dbs) {
    //   console.debug('3', dbKey);
    //   const dbname = dbs[dbKey];
    //   // const userExists = await client.query(format('SELECT 1 FROM pg_roles WHERE rolname=%L', dbname));
    //   // const databaseExists = await instance.databaseExists(dbname);
    //   // console.debug('after exists', databaseExists, userExists.rowCount !== 0);
    //   // if(userExists.rowCount !== 0 && databaseExists) {
    //   //   console.debug('dropping user', dbname);
    //   //   await client.query(format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON TABLES FROM %I', dbname, dbname));
    //   //   await client.query(format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I', dbname, dbname));
    //   //   await client.query(format('REVOKE ALL PRIVILEGES ON DATABASE %I FROM %I', dbname, dbname));
    //   //   console.debug('revoked privileges for', dbname);
    //   //   await client.query(format('DROP ROLE IF EXISTS %I', dbname));
    //   //   console.debug('dropped role', dbname);
    //   // }
    //   console.debug('before drop db', dbname);
    //   // console.debug(await client.query(format('DROP DATABASE IF EXISTS %I', dbs[dbKey])));
    //   console.debug('after drop db');
    // }
    // console.debug('done');
  }); 

  afterEach(() => {

  });

  afterAll(async () => {
  });


  test('Database and user creation', async() => {
    console.debug('start');
    const dbExists = await instance.databaseExists(dbs.new_empty);
    console.debug('db exists?', dbExists);
    expect(dbExists).toBeFalsy();
    await instance.createDatabase(dbs.new_empty);
    console.debug('db created', dbs.new_empty);
    const dbExistsAfterCreation = await instance.databaseExists(dbs.new_empty);
    console.debug('db exists?', dbExists);
    expect(dbExistsAfterCreation).toBeTruthy();

    const userExists = await instance.userExists(dbs.new_empty);
    console.debug('user exists?', userExists);
    expect(userExists).toBeFalsy();
    
    await instance.createUserWithAccessToDb(dbs.new_empty, 'randompass');
    const userExistsAfterCreation = await instance.userExists(dbs.new_empty);
    expect(userExistsAfterCreation).toBeTruthy();
    console.debug('user exists?', userExistsAfterCreation);
    await instance.createDatabase(dbs.nonexistent);

    // Test if user can create in db
    let config = dbConfig();
    config.database = dbs.new_empty;
    config.user = dbs.new_empty;
    config.password = 'randompass';
    const newEmptyInstance = new DatabaseInstance(config);
    console.debug('connected to', await newEmptyInstance.pool.query('SELECT current_database();'));
    await newEmptyInstance.pool.query(`CREATE TABLE films (
      code        char(5),
      title       varchar(40),
      did         integer,
      date_prod   date,
      kind        varchar(10),
      len         interval hour to minute,
      CONSTRAINT production UNIQUE(date_prod)
    );`);
    await newEmptyInstance.pool.query(`INSERT INTO films (code, title, did, date_prod, kind, len)
    VALUES ('F5678', 'The Godfather', 102, '1972-03-24', 'Crime', '2:55');`);
    const res = await newEmptyInstance.pool.query(`SELECT * FROM films;`);
    console.debug('get result', res);

    let newConfig = dbConfig();
    newConfig.database = dbs.nonexistent;
    config.user = dbs.new_empty;
    config.password = 'randompass';
    const newOtherInstance = new DatabaseInstance(newConfig);
    console.debug('connected to', await newOtherInstance.pool.query('SELECT current_database();'));
    await newOtherInstance.pool.query(`CREATE TABLE films (
      code        char(5),
      title       varchar(40),
      did         integer,
      date_prod   date,
      kind        varchar(10),
      len         interval hour to minute,
      CONSTRAINT production UNIQUE(date_prod)
    );`);
    await newOtherInstance.pool.query(`INSERT INTO films (code, title, did, date_prod, kind, len)
      VALUES ('F5678', 'The Godfather', 102, '1972-03-24', 'Crime', '2:55');`);
    const res3 = await newOtherInstance.pool.query(`SELECT * FROM films;`);
    console.debug('get result', res3);
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

