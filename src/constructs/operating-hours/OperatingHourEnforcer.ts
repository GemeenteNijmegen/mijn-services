import * as cdk from 'aws-cdk-lib';
import { AttributeType, BillingMode, Table } from 'aws-cdk-lib/aws-dynamodb';
import { ICluster } from 'aws-cdk-lib/aws-ecs';
import { Rule, Schedule } from 'aws-cdk-lib/aws-events';
import { LambdaFunction } from 'aws-cdk-lib/aws-events-targets';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { OperatingHoursEnforcerFunction } from './operatingHoursEnforcer-function';

export interface OperatingHours {
  /**
   * Start hour on 24-hour clock (UTC). E.g. 6 for 6 AM.
   */
  startHour: number;
  /**
   * End hour on 24-hour clock (UTC). E.g. 20 for 8 PM.
   */
  endHour: number;
}

export interface OperatingHourEnfocerProps {
  operatingHours: OperatingHours;
  /**
   * The ECS cluster whose services should be scaled down outside operating hours.
   */
  cluster: ICluster;
}

/**
 * Scales all ECS services in a cluster to zero outside operating hours and restores
 * their original desired counts when operating hours resume.
 *
 * Desired counts are persisted in DynamoDB so they survive Lambda cold starts.
 * The Lambda runs at 5 minutes past each hour (UTC).
 */
export class OperatingHourEnforcer extends Construct {

  constructor(scope: Construct, id: string, props: OperatingHourEnfocerProps) {
    super(scope, id);

    const table = new Table(this, 'DesiredCountTable', {
      partitionKey: { name: 'clusterArn', type: AttributeType.STRING },
      sortKey: { name: 'serviceArn', type: AttributeType.STRING },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      billingMode: BillingMode.PAY_PER_REQUEST,
    });

    const fn = new OperatingHoursEnforcerFunction(this, 'Function', {
      timeout: cdk.Duration.minutes(5),
      environment: {
        CLUSTER_ARN: props.cluster.clusterArn,
        TABLE_NAME: table.tableName,
        START_HOUR: props.operatingHours.startHour.toString(),
        END_HOUR: props.operatingHours.endHour.toString(),
      },
    });

    table.grantReadWriteData(fn);

    const stack = cdk.Stack.of(this);

    fn.addToRolePolicy(new PolicyStatement({
      actions: ['ecs:ListServices'],
      resources: [props.cluster.clusterArn],
    }));

    fn.addToRolePolicy(new PolicyStatement({
      actions: ['ecs:DescribeServices', 'ecs:UpdateService'],
      resources: [
        `arn:aws:ecs:${stack.region}:${stack.account}:service/${props.cluster.clusterName}/*`,
      ],
      conditions: {
        ArnEquals: { 'ecs:cluster': props.cluster.clusterArn },
      },
    }));

    new Rule(this, 'Schedule', {
      schedule: Schedule.cron({ minute: '5' }),
      targets: [new LambdaFunction(fn)],
    });
  }

}
