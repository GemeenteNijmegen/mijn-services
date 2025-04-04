import * as postgres from 'pg';
import format from 'pg-format';

export class DatabaseInstance {
  public pool: postgres.Pool;
  private config: postgres.PoolConfig;
  constructor(config: {
    user: string;
    password: string;
    host: string;
    port: number;
    database: string;
  }) {
    this.config = config;
    this.pool = new postgres.Pool(config);
  }

  async startTransaction(client: postgres.Client) {
    await client.query('BEGIN');
  }

  async endTransaction(client: postgres.Client, commit: boolean) {
    if(commit) {
      await client?.query('COMMIT');
    } else {
      await client?.query('ROLLBACK');
    }
  }


  async connected() {
    const connectedString = 'Connection to postgres successful!';
    const res = await this.pool.query('SELECT $1::text as connected', ['']);
    console.debug(res);
    if((res.rows[0].connected) == connectedString) {
      return true;
    }
    return false;
  }

  async userExists(name: string) {
    const resp = await this.pool.query(`SELECT FROM pg_catalog.pg_roles WHERE rolname = $1;`, [name]);
    console.debug(`role ${name} exists? `, resp);
    return resp.rowCount !== 0;
  }

  // Create a user, and grant full access to the database of the same name
  async createUserWithAccessToDb(name: string, password: string) {
      if(!await this.databaseExists(name)) {
        throw Error('Cant create user for nonexistent database');
      }
      // FIRST CONNECT TO THE DB USER should have ACCESS to
      const newDBConf = this.config;
      newDBConf.database = name;
      const newDbClient = new postgres.Client(newDBConf);
      await newDbClient.connect();
      try {
        await this.startTransaction(newDbClient);
        const dbResult = await newDbClient.query('SELECT current_database();');
        const current = dbResult.rows[0].current_database;
        if(dbResult.rows[0].current_database !== name) {
          throw Error(`Connected to incorrect db (current: ${current}), aborting`);
        }
        console.debug('Connected to DB ', dbResult.rows[0].current_database);

        await newDbClient.query(format('CREATE ROLE %I WITH LOGIN PASSWORD %L', name, password));
        await newDbClient.query(format('GRANT ALL PRIVILEGES ON DATABASE %I TO %I;', name, name));
        //bestaande tabellen
        await newDbClient.query(format('GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO %I;', name)); 
        //bestaande sequences
        await newDbClient.query(format('GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO %I;', name, name)); 
        //nieuwe tabellen
        await newDbClient.query(format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT ALL ON TABLES TO %I;', name, name)); 
        //nieuwe sequences
        await newDbClient.query(format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT ALL ON SEQUENCES TO %I;', name, name));
        await this.endTransaction(newDbClient, true); 
        await newDbClient.end();
      } catch (error) {
        await this.endTransaction(newDbClient, false);
        console.log('Unexpected error: rolled back transaction in createUserWithAccessToDb');
        throw(error);
      }
  }

  async databaseExists(name: string) {
    console.debug('check existence');
    const resp = await this.pool.query(`SELECT datname FROM pg_catalog.pg_database WHERE datname = $1;`, [name]);
    console.debug('completed query');
    return resp.rowCount !== 0;
  }

  async createDatabase(name: string) {
    try {
      console.debug('Creating database', name);
      const query = format('CREATE DATABASE %I', name);
      await this.pool.query(query);
    } catch (err) {
      console.error(err);
      throw Error(`Could not create database ${name}`);
    }
  }
}
