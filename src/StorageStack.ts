import { GemeenteNijmegenVpc } from '@gemeentenijmegen/aws-constructs';
import { Stack, StackProps, CustomResource, aws_backup as backup, aws_kms as kms } from 'aws-cdk-lib';
import { SecurityGroup, Port, SubnetType } from 'aws-cdk-lib/aws-ec2';
import { FileSystem } from 'aws-cdk-lib/aws-efs';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { Provider } from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';
import { Configurable } from './Configuration';
import { Database } from './constructs/Database';
import { CreateDatabasesFunction } from './custom-resources/create-databases/create-databases-function';
import { Statics } from './Statics';
import { TransferServer } from './TransferServer';
import { TransferUser } from './TransferUser';

interface StorageStackProps extends StackProps, Configurable { }

export class StorageStack extends Stack {
  private filesystem: FileSystem;
  public readonly database;
  private readonly credentials;
  private readonly vpc;
  private kmsKey: kms.Key;
  constructor(scope: Construct, id: string, props: StorageStackProps) {
    super(scope, id, props);

    this.credentials = Secret.fromSecretNameV2(this, 'database-credentials', Statics._ssmDatabaseCredentials);
    this.vpc = new GemeenteNijmegenVpc(this, 'vpc');
    this.kmsKey = this.createKmsKey();

    this.database = new Database(this, 'database', {
      databaseSecret: this.credentials,
      vpc: this.vpc.vpc,
      databaseSnapshotRetentionDays: props.configuration.databaseSnapshotRetentionDays ?? 35,
      kmsKey: this.kmsKey,
    });

    if (props.configuration.databases) {
      this.createRequiredDatabasesIfNotExistent(props.configuration.databases);
    }

    this.filesystem = this.createFileSytem();
    this.createBackupPlan(this.filesystem);
    if (props.configuration.createTransferServer) {
      this.createSftpConnector(this.filesystem);
    }
  }

  private createKmsKey() {
    const key = new kms.Key(this, 'kms-key', {
      description: 'Mijn Services Storage and DB encryption key',
      alias: 'mijn-services-storage-db-key',
    });

    return key;
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

  private createFileSytem() {
    const privateFileSystemSecurityGroup = new SecurityGroup(this, 'efs-security-group', {
      vpc: this.vpc.vpc,
    });

    const fs = new FileSystem(this, 'esf-filesystem', {
      vpc: this.vpc.vpc,
      securityGroup: privateFileSystemSecurityGroup,
      encrypted: true,
      kmsKey: this.kmsKey,
    });

    new StringParameter(this, 'FileSystemArnParameter', {
      parameterName: Statics._ssmFilesystemArn,
      stringValue: fs.fileSystemArn,
    });

    new StringParameter(this, 'FileSystemSecurityGroupNameParameter', {
      parameterName: Statics._ssmFilesystemSecurityGroupId,
      stringValue: privateFileSystemSecurityGroup.securityGroupId,
    });

    return fs;

  }

  createSftpConnector(filesystem: FileSystem) {
    const transferServer = new TransferServer(this, 'tfserver', {
      name: 'mijnservices-transfer-server',
      domain: 'EFS',
    });

    new TransferUser(this, 'tfuser', {
      filesystem,
      server: transferServer,
    });
  }

  /**
   * Creates a backup plan for the EFS file system.
   */
  private createBackupPlan(fileSystem: FileSystem) {
    const backupVaultArn = StringParameter.valueForStringParameter(
      this,
      Statics._ssmBackupVaultArn,
    );

    const backupVault = backup.BackupVault.fromBackupVaultArn(this, 'backup-vault', backupVaultArn);

    const backupPlan = backup.BackupPlan.dailyMonthly1YearRetention(this, 'efs-backup-plan', backupVault);
    backupPlan.addSelection('backup-selection', {
      resources: [
        backup.BackupResource.fromEfsFileSystem(fileSystem),
      ],
    });
  }
}
