import * as postgres from 'pg';
import format from 'pg-format';

export class DatabaseInstance {
  private pool: postgres.Pool;
  private config: postgres.PoolConfig;
  private client?: postgres.PoolClient; // Used for transactions;
  private inTransaction: boolean = false;
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

  // Return the client if a transaction is open
  // Otherwise return the pool
  currentClient() {
    return this.inTransaction && this.client ? this.client : this.pool;
  }

  async close() {
    this.pool.end();
  }

  async startTransaction() {
    this.client = await this.pool.connect();
    await this.client.query('BEGIN');
    this.inTransaction = true;
  }

  async endTransaction(commit: boolean) {
    if(commit) {
      await this.client?.query('COMMIT');
    } else {
      await this.client?.query('ROLLBACK');
    }
    this.client?.release();
    this.client = undefined;
    this.inTransaction = false;
  }


  async connected() {
    const connectedString = 'Connection to postgres successful!';
    const res = await this.currentClient().query('SELECT $1::text as connected', ['']);
    console.debug(res);
    if((res.rows[0].connected) == connectedString) {
      return true;
    }
    return false;
  }

  async userExists(name: string) {
    const resp = await this.currentClient().query(`SELECT FROM pg_catalog.pg_roles WHERE rolname = $1;`, [name]);
    return resp.rowCount !== 0;
  }

  // Create a user, and grant full access to the database of the same name
  async createUserWithAccessToDb(name: string) {
      // FIRST CONNECT TO THE DB USER should have ACCESS to
      if(!this.databaseExists(name)) {
        throw Error('Cant create user for nonexistent database');
      }
      const newDBConf = this.config;
      newDBConf.database = name;
      const newDBPool = new postgres.Pool(newDBConf);
      try {
        this.startTransaction();
        const dbResult = await newDBPool.query('SELECT current_database();');
        const current = dbResult.rows[0].current_database;
        if(dbResult.rows[0].current_database !== name) {
          throw Error(`Connected to incorrect db (current: ${current}), aborting`);
        }

        newDBPool.query(format('CREATE ROLE %I WITH LOGIN', name));
        newDBPool.query(format('GRANT ALL PRIVILEGES ON DATABASE %I TO %I;', name, name));
        //bestaande tabellen
        newDBPool.query(format('GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO %I;', name)); 
        //bestaande sequences
        newDBPool.query(format('GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO %I;', name, name)); 
        //nieuwe tabellen
        newDBPool.query(format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT ALL ON TABLES TO %I;', name, name)); 
        //nieuwe sequences
        newDBPool.query(format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT ALL ON SEQUENCES TO %I;', name, name)); 
      } catch (error) {
        this.endTransaction(false);
        console.log('Unexpected error: rolled back transaction in createUserWithAccessToDb');
        throw(error);
      }
  }

  async databaseExists(name: string) {
    const resp = await this.currentClient().query(`SELECT datname FROM pg_catalog.pg_database WHERE datname = $1;`, [name]);
    return resp.rowCount !== 0;
  }

  async createDatabase(name: string) {
    try {
      const query = format('CREATE DATABASE %I', name);
      await this.currentClient().query(query);
    } catch (err) {
      console.error(err);
      throw Error(`Could not create database ${name}`);
    }
  }
}
