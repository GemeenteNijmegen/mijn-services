import * as cdk from 'aws-cdk-lib';
import { RemovalPolicy } from 'aws-cdk-lib';
import { ISecurityGroup, IVpc, Port, SubnetType } from 'aws-cdk-lib/aws-ec2';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as cr from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';
import { DatabaseCustomResourceFunction } from './databaseCustomResource-function';

export interface AdditionalDatabaseProps {
  /**
   * The existing RDS instance to create the database on.
   */
  readonly instance: rds.IDatabaseInstance;

  /**
   * Secret containing admin credentials { username, password }.
   * Used to connect to the RDS instance and perform DDL operations.
   */
  readonly adminCredentialsSecret: secretsmanager.ISecret;

  /**
   * Secret containing the new database user's credentials { username, password }.
   * This user will own the new database.
   */
  readonly dbUserCredentialsSecret: secretsmanager.ISecret;

  /**
   * Name of the database to create.
   * Must be alphanumeric + underscores only.
   */
  readonly databaseName: string;

  /**
   * The VPC the RDS instance is in.
   * The Lambda will be placed in the same VPC.
   */
  readonly vpc: IVpc;
  /**
   * Security group(s) to attach to the Lambda function.
   * If not provided, a dedicated security group is created.
   */
  readonly securityGroups?: ISecurityGroup[];

  /**
   * The default admin database to connect to (default: 'postgres').
   */
  readonly adminDatabase?: string;

  /**
   * The default admin database to connect to (default: 'postgres').
   */
  readonly updateBump?: string;

  /**
   * The removal policy
   */
  readonly removalPolicy?: RemovalPolicy;

}

export class AdditionalDatabase extends Construct {
  /**
   * The physical name of the created database.
   */
  readonly databaseName: string;

  constructor(scope: Construct, id: string, props: AdditionalDatabaseProps) {
    super(scope, id);

    this.databaseName = props.databaseName;

    // --- Lambda handler ---
    const handlerFunction = new DatabaseCustomResourceFunction(this, 'Handler', {
      timeout: cdk.Duration.minutes(5),
      vpc: props.vpc,
      vpcSubnets: {
        subnetType: SubnetType.PRIVATE_WITH_EGRESS,
      },
      environment: {
        ADMIN_CREDENTIALS_ARN: props.adminCredentialsSecret.secretArn,
        DB_USER_CREDENTIALS_ARN: props.dbUserCredentialsSecret.secretArn,
        DB_HOST: props.instance.instanceEndpoint.hostname,
        DB_PORT: props.instance.instanceEndpoint.port.toString(),
        DB_ADMIN_DATABASE: props.adminDatabase ?? 'postgres',
        DB_NAME: props.databaseName,
      },
    });

    // Allow Lambda to connect to RDS on the database port
    props.instance.connections.allowFrom(
      handlerFunction.connections,
      Port.tcp(props.instance.instanceEndpoint.port),
      `Allow SingleDatabase Lambda to connect for database ${props.databaseName}`,
    );

    // --- Grant secret access ---
    props.adminCredentialsSecret.grantRead(handlerFunction);
    props.dbUserCredentialsSecret.grantRead(handlerFunction);

    // --- Custom resource provider ---
    const provider = new cr.Provider(this, 'Provider', {
      onEventHandler: handlerFunction,
      logRetention: RetentionDays.ONE_MONTH,
      vpc: props.vpc,
      vpcSubnets: {
        subnetType: SubnetType.PRIVATE_WITH_EGRESS,
      },
    });

    // --- Custom resource ---
    // The resource is tied to the database name.
    // If databaseName changes, CDK will trigger a new Create event (new physical ID).
    new cdk.CustomResource(this, 'Resource', {
      serviceToken: provider.serviceToken,
      resourceType: 'Custom::SingleDatabase',
      properties: {
        // Changing databaseName forces re-creation
        DatabaseName: props.databaseName,
        updateBump: props.updateBump ?? '3',
        UserSecretArn: props.dbUserCredentialsSecret.secretArn,
        RemovalPolicy: props.removalPolicy ?? RemovalPolicy.RETAIN,
      },
    });
  }
}