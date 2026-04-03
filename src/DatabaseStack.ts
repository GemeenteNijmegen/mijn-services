import { GemeenteNijmegenVpc } from '@gemeentenijmegen/aws-constructs';
import { CfnOutput, CustomResource, RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib';
import { Port, SecurityGroup, SubnetType } from 'aws-cdk-lib/aws-ec2';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { Provider } from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';
import { Configurable } from './ConfigurationInterfaces';
import { Database } from './constructs/Database';
import { CreateDatabasesFunction } from './custom-resources/create-databases/create-databases-function';
import { AdditionalDatabase } from './custom-resources/database/AdditionalDatabase';
import { Statics } from './Statics';

interface DatabaseStackProps extends StackProps, Configurable { }


/**
 * Creates the database instance (only one currenlty)
 * and create the databases.
 */
export class DatabaseStack extends Stack {

  public readonly database;
  private readonly credentials;
  private readonly vpc;

  constructor(scope: Construct, id: string, props: DatabaseStackProps) {
    super(scope, id, props);

    this.credentials = Secret.fromSecretNameV2(this, 'database-credentials', Statics._ssmDatabaseCredentials);
    this.vpc = new GemeenteNijmegenVpc(this, 'vpc');

    this.database = new Database(this, 'database', {
      databaseSecret: this.credentials,
      vpc: this.vpc.vpc,
      databaseSnapshotRetentionDays: props.configuration.databaseSnapshotRetentionDays ?? 35,
    });

    if (props.configuration.databases) {
      this.createRequiredDatabasesIfNotExistent(props.configuration.databases);
      // With user
      this.createRequiredDatabasesIfNotExistentSecuredWithOwnCredentials(props.configuration.databases);
    }


    this.setupDatabaseManagementSecurityGroup();
  }

  /**
   * Once all database are migrated we can remove this method and custom resource
   * @param databases
   */
  private createRequiredDatabasesIfNotExistent(databases: string[]) {
    const LIST_OF_DATABASES = databases.join(',');

    const port = this.database.db.instanceEndpoint.port;
    const hostname = this.database.db.instanceEndpoint.hostname;

    const createDatabaseFunction = new CreateDatabasesFunction(this, 'create-databases-function', {
      vpc: this.vpc.vpc,
      vpcSubnets: {
        subnetType: SubnetType.PRIVATE_ISOLATED, // Make sure this is the same as the database
      },
      environment: {
        LIST_OF_DATABASES,
        DB_CREDENTIALS_ARN: this.credentials.secretArn,
        DB_HOST: hostname,
        DB_PORT: port.toString(),
        DB_NAME: Statics.defaultDatabaseName,
        BUMP: '1',
      },
    });
    this.credentials.grantRead(createDatabaseFunction);
    this.database.db.connections.allowFrom(createDatabaseFunction.connections, Port.tcp(port));

    // Run the custom resources
    const provider = new Provider(this, 'custom-resource-provider', {
      onEventHandler: createDatabaseFunction,
    });
    const resource = new CustomResource(this, 'custom-resource', {
      serviceToken: provider.serviceToken,
      properties: {
        listOfDatabases: LIST_OF_DATABASES,
      },
    });
    resource.node.addDependency(this.database.db);


  }

  private createRequiredDatabasesIfNotExistentSecuredWithOwnCredentials(databases: string[]) {
    for (const database of databases) {

      // Construct database name on our DB instance
      const dbName = `${database}-database`;
      console.log('Creating custom resource for deploying database:', dbName);

      // Create credentials for DB on our DB instance
      const credentials = new Secret(this, `db-${dbName}-credentials`, {
        description: `Credentials for connecting to the ${dbName} database instance`,
        generateSecretString: {
          excludePunctuation: true,
          secretStringTemplate: JSON.stringify({
            username: dbName,
          }),
          generateStringKey: 'password',
        },
        secretName: Statics.databaseCredentialsName(dbName),
      });

      // Custom resource for creating the actual database
      new AdditionalDatabase(this, `${dbName}-db`, {
        adminCredentialsSecret: this.credentials,
        databaseName: dbName,
        dbUserCredentialsSecret: credentials,
        instance: this.database.db,
        vpc: this.vpc.vpc,
        removalPolicy: RemovalPolicy.RETAIN,
      });
    }
  }

  private setupDatabaseManagementSecurityGroup() {
    // Create a security group
    const databaseManagementSecurityGroup = new SecurityGroup(this, 'database-management-sg', {
      securityGroupName: 'database-management',
      description: 'Allow database management tools to connect to the database',
      vpc: this.vpc.vpc,
    });

    // Allow it to connect to the database
    this.database.db.connections.allowFrom(databaseManagementSecurityGroup, Port.tcp(5432));

    // Output it for good mesures. We need to find this in case of emergency as well.
    new CfnOutput(this, 'databaseManagementSecurityGroupId', {
      value: databaseManagementSecurityGroup.securityGroupId,
    });
  }


}
