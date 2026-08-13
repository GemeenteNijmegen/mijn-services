import { Criticality, ErrorMonitoringAlarm } from '@gemeentenijmegen/aws-constructs';
import { ConfigTable } from '@gemeentenijmegen/config/construct';
import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import { Alarm, ComparisonOperator, Metric, TreatMissingData } from 'aws-cdk-lib/aws-cloudwatch';
import { AttributeType, BillingMode, Table } from 'aws-cdk-lib/aws-dynamodb';
import { Function, Tracing } from 'aws-cdk-lib/aws-lambda';
import { FilterPattern } from 'aws-cdk-lib/aws-logs';
import { Schedule, ScheduleExpression, ScheduleTargetInput } from 'aws-cdk-lib/aws-scheduler';
import { LambdaInvoke } from 'aws-cdk-lib/aws-scheduler-targets';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';
import { Statics } from '../../Statics';
import { NotificationHandlerFunction } from './NotificationHandler/NotificationHandler-function';


interface ObjectNotificationServiceProps {
  scheduleExpression: ScheduleExpression;
  configKey: string;
}

export class ObjectNotificationService extends Construct {
  constructor(scope: Construct, id: string, private props: ObjectNotificationServiceProps) {
    super(scope, id);

    const lambda = this.setupLambda(props);
    const table = this.setupConfig(props, lambda);
    lambda.addEnvironment('APP_CONFIG_TABLENAME', table.tableName);

    this.setupMonitoring(lambda);
  }

  private setupLambda(props: ObjectNotificationServiceProps) {
    const idemPotencyHashTable = this.setupIdempotencyTable();
    // Create runtime config
    const lambda = new NotificationHandlerFunction(this, 'notificationhandler', {
      environment: {
        IDEMPOTENCY_TABLE_NAME: idemPotencyHashTable.tableName,
        POWERTOOLS_LOG_LEVEL: 'DEBUG',
      },
      memorySize: 1024,
      timeout: Duration.minutes(5),
      description: 'Object Notification Service handler',
      tracing: Tracing.ACTIVE,
    });
    idemPotencyHashTable.grantReadWriteData(lambda);

    new Schedule(this, 'schedule', {
      schedule: props.scheduleExpression,
      target: new LambdaInvoke(lambda, {
        input: ScheduleTargetInput.fromObject({
          configKey: props.configKey,
        }),
      }),
      description: 'This schedule is responsible for invoking the objectnotification service',
    });
    return lambda;
  }

  private setupConfig(props: ObjectNotificationServiceProps, lambda: NotificationHandlerFunction) {
    const notifyTokenSecret = Secret.fromSecretNameV2(this, 'notifysecret', Statics.ssmObjectNotifierNotifyToken);
    const objectsSecret = Secret.fromSecretNameV2(this, 'objectssecret', Statics.ssmObjectNotifierObjectsToken);

    const config = new ConfigTable(this, 'config', {
      config: {
        [props.configKey]: {
          notifyBaseUrl: 'https://api.notifynl.nl/v2/notifications/',
          notifyIssuer: '',
          notifyToken: notifyTokenSecret.secretArn,
          objectFilter: {
            filters: [
              {
                operator: 'equals',
                path: 'mypath',
                value: '',
              },
            ],
          },
          objectMappings: [
            {
              personalisation: {},
              template_id: '',
              email_address: '',
              phone_number: '',
            },
          ],
          objectPatchConfiguration: {
            record: {},
          },
          objectsBaseUrl: 'https://example.com/objects/api/v2/objects',
          objectsToken: objectsSecret.secretArn,
        },
      },
    });

    config.table.grantReadData(lambda);
    notifyTokenSecret.grantRead(lambda);
    objectsSecret.grantRead(lambda);
    return config.table;
  }

  /**
   * To prevent parallel executions of the same service, which might result in
   * duplicate notifications, we setup idempotency controls.
   */
  private setupIdempotencyTable() {
    const table = new Table(this, 'idempotency-hash', {
      partitionKey: {
        name: 'hash',
        type: AttributeType.STRING,
      },
      timeToLiveAttribute: 'ttl',
      billingMode: BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    return table;
  }

  private setupMonitoring(lambda: Function) {
    new ErrorMonitoringAlarm(this, `${this.node.id}-monitor-errors`, {
      criticality: 'critical',
      lambda,
      errorRateProps: {
        filterPattern: FilterPattern.anyTerm('ObjectsNotificationServiceFailed'),
        alarmEvaluationPeriod: Duration.minutes(1),
        alarmEvaluationPeriods: 1,
        alarmThreshold: 1,
      },
    });

    this.setupNotificationSuccessRateAlarm();
  }

  /**
   * Alarms on the `NotificationSuccessRate` custom metric published by the
   * handler (a 0-1 fraction of notifications that succeeded per run), so we
   * catch a degraded notify/objects API instead of only whole-invocation crashes.
   */
  private setupNotificationSuccessRateAlarm() {
    const criticality = Criticality.fromString('critical');
    const metric = new Metric({
      namespace: 'ObjectNotificationService',
      metricName: 'NotificationSuccessRate',
      dimensionsMap: { ObjectsNotificationInstance: this.props.configKey },
      statistic: 'Average',
      period: Duration.hours(1),
    });

    new Alarm(this, `${this.node.id}-monitor-notification-success-rate`, {
      alarmName: `${this.node.id}-notification-success-rate${criticality.alarmSuffix()}`,
      alarmDescription: 'Alarms when the average share of successfully sent notifications drops below the evaluation window.',
      metric,
      threshold: 0.95, // If 5 percent or more fails.
      evaluationPeriods: 1,
      comparisonOperator: ComparisonOperator.LESS_THAN_THRESHOLD,
      // No notifications sent in a period (e.g. nothing matched the object
      // filter) should not page anyone - only alarm on an actual low rate.
      treatMissingData: TreatMissingData.NOT_BREACHING,
    });
  }

}
