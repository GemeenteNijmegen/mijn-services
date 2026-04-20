import { Criticality, DeadLetterQueue, ErrorMonitoringAlarm } from '@gemeentenijmegen/aws-constructs';
import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import { AttributeType, BillingMode, Table } from 'aws-cdk-lib/aws-dynamodb';
import { Key } from 'aws-cdk-lib/aws-kms';
import { ApplicationLogLevel, Function, LoggingFormat, SystemLogLevel, Tracing } from 'aws-cdk-lib/aws-lambda';
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { FilterPattern, LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { Queue, QueueEncryption } from 'aws-cdk-lib/aws-sqs';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { OpenKlantRegistrationServiceConfiguration } from '../../ConfigurationInterfaces';
import { ReceiverFunction } from './NotificationReceiver/receiver-function';
import { RegistrationHandlerFunction } from './RegistrationHandler/registration-handler-function';
import { ServiceLoadBalancer } from '../../constructs/LoadBalancer';
import { Statics } from '../../Statics';

export interface OpenKlantRegistrationServiceProps {
  openKlantRegistrationServiceConfiguration: OpenKlantRegistrationServiceConfiguration;
  criticality: Criticality;
  key: Key;
  loadbalancer: ServiceLoadBalancer;
}

export class OpenKlantRegistrationService extends Construct {

  private readonly props: OpenKlantRegistrationServiceProps;
  private readonly params: any;

  constructor(scope: Construct, id: string, props: OpenKlantRegistrationServiceProps) {
    super(scope, id);

    this.props = props;
    this.params = this.setupVulServiceConfiguration(id);
    const idempotency = this.setupIdempotencyTable();

    const queue = this.setupQueue();
    this.setupRegistrationHandler(id, queue, idempotency);
    this.setupNotificationReceiver(id, queue);

  }

  private setupQueue() {

    const dlq = new DeadLetterQueue(this, 'dlq', {
      alarm: true,
      kmsKey: this.props.key,
      alarmCriticality: this.props.criticality.increase(),
      queueOptions: {
        fifo: true,
      },
    });

    const queue = new Queue(this, 'queue', {
      fifo: true,
      deadLetterQueue: {
        maxReceiveCount: 5,
        queue: dlq.dlq,
      },
      encryption: QueueEncryption.KMS,
      encryptionMasterKey: this.props.key,
    });

    return queue;
  }

  private setupRegistrationHandler(id: string, queue: Queue, idempotency: Table) {

    const logs = new LogGroup(this, 'registration-handler-logs', {
      encryptionKey: this.props.key,
      retention: RetentionDays.SIX_MONTHS,
    });

    let environment: Record<string, string> = {};
    if (this.props.openKlantRegistrationServiceConfiguration.catalogiWhitelist) {
      environment.CATALOGI_WHITELIST = this.props.openKlantRegistrationServiceConfiguration.catalogiWhitelist.join(',');
    }

    const openKlantConfig = this.props.openKlantRegistrationServiceConfiguration;
    const service = new RegistrationHandlerFunction(this, 'registration-handler', {
      timeout: Duration.seconds(30),
      description: `Registration handler endpoint for ${id}`,
      environment: {
        OPEN_KLANT_API_URL: openKlantConfig.openKlantUrl,
        OPEN_KLANT_API_KEY_ARN: this.params.openklant.secretArn,
        ZGW_TOKEN_CLIENT_ID_ARN: this.params.zgw.id.secretArn,
        ZGW_TOKEN_CLIENT_SECRET_ARN: this.params.zgw.secret.secretArn,
        ZAKEN_API_URL: openKlantConfig.zakenApiUrl,
        DEBUG: openKlantConfig.debug ? 'true' : 'false',
        ROLTYPES_TO_REGISTER: openKlantConfig.roltypesToRegister.join(','),
        STRATEGY: this.props.openKlantRegistrationServiceConfiguration.strategy,

        FORM_SUBMISSIONS_API_ENDPOINT_SSM: this.params.submissionstorage.endpoint.parameterName,
        FORM_SUBMISSIONS_API_KEY_ARN: this.params.submissionstorage.apiKey.secretName,

        IDEMPOTENCY_TABLE_NAME: idempotency.tableName,
        SERVICE_NAME: id,
        AWS_XRAY_DEBUG_MODE: this.props.openKlantRegistrationServiceConfiguration.debug ? 'TRUE' : 'FALSE',
        AWS_XRAY_LOG_LEVEL: this.props.openKlantRegistrationServiceConfiguration.debug ? SystemLogLevel.DEBUG : SystemLogLevel.INFO,
        ...environment,
      },
      logGroup: logs,
      loggingFormat: LoggingFormat.JSON,
      systemLogLevelV2: this.props.openKlantRegistrationServiceConfiguration.debug ? SystemLogLevel.DEBUG : SystemLogLevel.INFO,
      applicationLogLevelV2: this.props.openKlantRegistrationServiceConfiguration.debug ? ApplicationLogLevel.DEBUG : ApplicationLogLevel.INFO,
      tracing: Tracing.ACTIVE,
    });
    idempotency.grantReadWriteData(service);
    this.props.key.grantEncrypt(service);
    this.params.submissionstorage.endpoint.grantRead(service);
    this.params.submissionstorage.apiKey.grantRead(service);
    this.params.openklant.grantRead(service);
    this.params.zgw.id.grantRead(service);
    this.params.zgw.secret.grantRead(service);

    this.setupMonitoring(service);

    // Maks the lambda listen to the queue
    const eventSource = new SqsEventSource(queue, { batchSize: 1 });
    service.addEventSource(eventSource);
  }

  private setupNotificationReceiver(id: string, queue: Queue) {

    const logs = new LogGroup(this, 'receiver-logs', {
      encryptionKey: this.props.key,
      retention: RetentionDays.SIX_MONTHS,
    });

    const openKlantConfig = this.props.openKlantRegistrationServiceConfiguration;

    const service = new ReceiverFunction(this, 'notification-receiver', {
      timeout: Duration.seconds(3),
      description: `Notification reciever endpoint for ${id}`,
      environment: {
        ZAKEN_API_URL: openKlantConfig.zakenApiUrl,
        DEBUG: openKlantConfig.debug ? 'true' : 'false',
        API_KEY_ARN: this.params.authentication.secretArn,
        QUEUE_URL: queue.queueUrl,
        REGISTRATION_SERVICE_ID: id,
        ENABLE_FORWARDING: openKlantConfig.enabled ? 'true' : 'false',
        SERVICE_NAME: id,
        AWS_XRAY_DEBUG_MODE: this.props.openKlantRegistrationServiceConfiguration.debug ? 'TRUE' : 'FALSE',
        AWS_XRAY_LOG_LEVEL: this.props.openKlantRegistrationServiceConfiguration.debug ? SystemLogLevel.DEBUG : SystemLogLevel.INFO,
      },
      logGroup: logs,
      loggingFormat: LoggingFormat.JSON,
      systemLogLevelV2: this.props.openKlantRegistrationServiceConfiguration.debug ? SystemLogLevel.DEBUG : SystemLogLevel.INFO,
      applicationLogLevelV2: this.props.openKlantRegistrationServiceConfiguration.debug ? ApplicationLogLevel.DEBUG : ApplicationLogLevel.INFO,
      tracing: Tracing.ACTIVE,
    });

    queue.grantSendMessages(service);
    this.props.key.grantEncrypt(service); // Queue is encrypted
    this.params.authentication.grantRead(service);

    new ErrorMonitoringAlarm(this, `${this.node.id}-monitor-errors-receiver`, {
      criticality: this.props.criticality,
      lambda: service,
    });

    this.setupRoute(service);

  }

  private setupVulServiceConfiguration(id: string) {
    const ssmApiKey = `/${Statics.projectName}/open-klant-registration/${id}/api-key`;
    const ssmSubmisisonStorageEndpoint = `/${Statics.projectName}/open-klant-registration/${id}/submission-storage-endpoint`;
    const ssmSubmisisonStorageApiKey = `/${Statics.projectName}/open-klant-registration/${id}/submission-storage-api-key`;
    const ssmOpenKlantApiKey = `/${Statics.projectName}/open-klant-registration/${id}/open-klant-api-key`;
    const ssmZgwTokenClientId = `/${Statics.projectName}/open-klant-registration/${id}/zgw/client-id`;
    const ssmZgwTokenClientSecret = `/${Statics.projectName}/open-klant-registration/${id}/zgw/clientsecret`;

    const openKlantApiKey = new Secret(this, 'open-klant-api-key', {
      secretName: ssmOpenKlantApiKey,
      description: `OpenKlantRegistrationService (${id}) api key for open-klant`,
    });

    const zgwTokenClientId = new Secret(this, 'zgw-token-client-id', {
      secretName: ssmZgwTokenClientId,
      description: `OpenKlantRegistrationService (${id}) ZGW token client id`,
    });

    const zgwTokenClientSecret = new Secret(this, 'zgw-token-client-secret', {
      secretName: ssmZgwTokenClientSecret,
      description: `OpenKlantRegistrationService (${id}) ZGW token client secret`,
    });

    const serviceApiKey = new Secret(this, 'service-api-key', {
      secretName: ssmApiKey,
      description: `OpenKlantRegistrationService (${id}) api key used for calling this service`,
      generateSecretString: {
        excludePunctuation: true,
        passwordLength: 64,
      },
    });

    const submisisonStorageEndpoint = new StringParameter(this, 'submission-storage-endpoint-url', {
      stringValue: '-',
      description: `Endpoint of submission storage (for ${id})`,
      parameterName: ssmSubmisisonStorageEndpoint,
    });

    const submisisonStorageApiKey = new Secret(this, 'submission-storage-api-key', {
      description: `Api key of submission storage (for ${id})`,
      secretName: ssmSubmisisonStorageApiKey,
    });

    return {
      openklant: openKlantApiKey,
      zgw: {
        id: zgwTokenClientId,
        secret: zgwTokenClientSecret,
      },
      submissionstorage: {
        endpoint: submisisonStorageEndpoint,
        apiKey: submisisonStorageApiKey,
      },
      authentication: serviceApiKey,
    };

  }

  private setupRoute(handler: Function) {
    this.props.loadbalancer.attachLambda(handler, this.props.openKlantRegistrationServiceConfiguration.path);
  }

  private setupMonitoring(service: RegistrationHandlerFunction) {
    new ErrorMonitoringAlarm(this, `${this.node.id}-monitor-errors`, {
      criticality: this.props.criticality,
      lambda: service,
    });

    new ErrorMonitoringAlarm(this, `${this.node.id}-monitor-rol-update-v2`, {
      criticality: this.props.criticality.increase(), // Bump by 1 as this is a must handle alarm
      lambda: service,
      metricNameSpace: `${this.node.id}-monitor-rol-update-errors`,
      errorRateProps: {
        filterPattern: FilterPattern.anyTerm('ROL UPDATE FAILED'),
        alarmEvaluationPeriod: Duration.minutes(1),
        alarmEvaluationPeriods: 1,
        alarmThreshold: 1,
      },
    });
  }


  private setupIdempotencyTable() {
    const table = new Table(this, 'idempotency-hash-table', {
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
