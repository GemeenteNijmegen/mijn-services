import { GemeenteNijmegenVpc } from '@gemeentenijmegen/aws-constructs';
import { Stack, StackProps } from 'aws-cdk-lib';
import { Port, SubnetType } from 'aws-cdk-lib/aws-ec2';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';
import { Configurable } from './Configuration';
import { Database } from './constructs/Database';
import { CreateDatabasesFunction } from './custom-resources/create-databases/create-databases-function';
import { Statics } from './Statics';

interface DatabaseStackProps extends StackProps, Configurable {
  databases?: string[];
}

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
    });

    if (props.databases) {
      this.createRequiredDatabasesIfNotExistent(props.databases);
    }

  }

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
      },
    });
    this.credentials.grantRead(createDatabaseFunction);
    this.database.db.connections.allowFrom(createDatabaseFunction.connections, Port.tcp(port));

    // Run the custom resources
    // const provider = new Provider(this, 'custom-resource-provider', {
    //   onEventHandler: createDatabaseFunction,
    // });
    // const resource = new CustomResource(this, 'custom-resource', {
    //   serviceToken: provider.serviceToken,
    // });
    // resource.node.addDependency(this.database.db);


  }

}