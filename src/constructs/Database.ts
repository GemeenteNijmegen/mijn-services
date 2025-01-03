import {
  aws_rds as rds, aws_ec2 as ec2, aws_kms as kms
} from 'aws-cdk-lib';
import { SubnetType } from 'aws-cdk-lib/aws-ec2';
import { ISecret } from 'aws-cdk-lib/aws-secretsmanager';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { Statics } from '../Statics';

export interface DatabaseProps {
  vpc: ec2.IVpc;
  databaseSecret: ISecret;
}

export class Database extends Construct {

  readonly db: rds.DatabaseInstance;

  constructor(scope: Construct, id: string, props: DatabaseProps) {
    super(scope, id);

    const dbKmsKey = new kms.Key(this, 'db-kms-key', {
      description: 'Mijn Services DB encryption key',
      alias: 'mijn-services-db-key',
    });

    this.db = new rds.DatabaseInstance(this, 'db-instance', {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_16_4,
      }),
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO), // Smallest instance possible to start with
      credentials: {
        username: props.databaseSecret.secretValueFromJson('username').toString(),
        password: props.databaseSecret.secretValueFromJson('password'),
      },
      vpc: props.vpc,
      databaseName: Statics.defaultDatabaseName, // Note: the default database is not used. We have a lambda to create the DBs
      storageEncryptionKey: dbKmsKey,
      vpcSubnets: {
        subnetType: SubnetType.PRIVATE_ISOLATED,
      },
      parameters: {
        'rds.force_ssl': '0',
      },
      deletionProtection: true,
    });

    new StringParameter(this, 'db-arn', {
      stringValue: this.db.instanceArn,
      parameterName: Statics._ssmDatabaseArn,
    });
    new StringParameter(this, 'db-endpoint', {
      stringValue: this.db.instanceEndpoint.hostname,
      parameterName: Statics._ssmDatabaseHostname,
    });
    new StringParameter(this, 'db-post', {
      stringValue: this.db.instanceEndpoint.port.toString(),
      parameterName: Statics._ssmDatabasePort,
    });
    new StringParameter(this, 'db-security-group', {
      stringValue: this.db.connections.securityGroups[0].securityGroupId,
      parameterName: Statics._ssmDatabaseSecurityGroup,
    });

  }
}