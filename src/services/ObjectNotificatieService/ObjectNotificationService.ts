import { RemovalPolicy } from 'aws-cdk-lib';
import { AttributeType, BillingMode, ITable, Table } from 'aws-cdk-lib/aws-dynamodb';
import { Schedule, ScheduleExpression, ScheduleTargetInput } from 'aws-cdk-lib/aws-scheduler';
import { LambdaInvoke } from 'aws-cdk-lib/aws-scheduler-targets';
import { Construct } from 'constructs';
import { NotificationHandlerFunction } from './NotificationHandler/NotificationHandler-function';


interface ObjectNotificationServiceProps {
  scheduleExpression: ScheduleExpression;
  configKey: string;
  configTable?: ITable;
}

export class ObjectNotificationService extends Construct {
  constructor(scope: Construct, id: string, private props: ObjectNotificationServiceProps) {
    super(scope, id);
    if (!this.props.configTable) {
      //TODO config
    }
    const idemPotencyHashTable = this.setupIdempotencyTable();
    // Create runtime config
    const lambda = new NotificationHandlerFunction(this, 'notificationhandler', {
      environment: {
        IDEMPOTENCY_TABLE_NAME: idemPotencyHashTable.tableName,
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
