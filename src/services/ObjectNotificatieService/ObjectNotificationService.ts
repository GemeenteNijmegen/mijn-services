import { ConfigTable } from '@gemeentenijmegen/config/construct';
import { RemovalPolicy } from 'aws-cdk-lib';
import { AttributeType, BillingMode, Table } from 'aws-cdk-lib/aws-dynamodb';
import { Schedule, ScheduleExpression, ScheduleTargetInput } from 'aws-cdk-lib/aws-scheduler';
import { LambdaInvoke } from 'aws-cdk-lib/aws-scheduler-targets';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';
import { NotificationHandlerFunction } from './NotificationHandler/NotificationHandler-function';
import { Statics } from '../../Statics';


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
  }

  private setupLambda(props: ObjectNotificationServiceProps) {
    const idemPotencyHashTable = this.setupIdempotencyTable();
    // Create runtime config
    const lambda = new NotificationHandlerFunction(this, 'notificationhandler', {
      environment: {
        IDEMPOTENCY_TABLE_NAME: idemPotencyHashTable.tableName,
        POWERTOOLS_LOG_LEVEL: 'DEBUG',
      },
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

}
