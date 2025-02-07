import { Criticality, DeadLetterQueue, ErrorMonitoringAlarm } from '@gemeentenijmegen/aws-constructs';
import { Duration } from 'aws-cdk-lib';
import { HttpApi, HttpMethod, MappingValue, ParameterMapping } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { Key } from 'aws-cdk-lib/aws-kms';
import { ApplicationLogLevel, Function, LoggingFormat, SystemLogLevel } from 'aws-cdk-lib/aws-lambda';
import { FilterPattern, LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { Queue, QueueEncryption } from 'aws-cdk-lib/aws-sqs';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { OpenKlantRegistrationServiceConfiguration } from '../../Configuration';
import { Statics } from '../../Statics';
import { ReceiverFunction } from './NotificationReceiver/receiver-function';
import { RegistrationHandlerFunction } from './RegistrationHandler/registration-handler-function';

export interface OpenKlantRegistrationServiceProps {
  openKlantRegistrationServiceConfiguration: OpenKlantRegistrationServiceConfiguration;
  api: HttpApi;
  criticality: Criticality;
  key: Key;
}

export class OpenKlantRegistrationService extends Construct {

  private readonly props: OpenKlantRegistrationServiceProps;
  private readonly params: any;

  constructor(scope: Construct, id: string, props: OpenKlantRegistrationServiceProps) {
    super(scope, id);

    this.props = props;
    this.params = this.setupVulServiceConfiguration(id);

    const queue = this.setupQueue();
    this.setupRegistrationHandler(id);
    this.setupNotificationReceiver(id, queue);

  }

  private setupQueue() {

    const dlq = new DeadLetterQueue(this, 'dlq', {
      alarm: true,
      kmsKey: this.props.key,
      alarmCriticality: this.props.criticality.increase(),
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

  private setupRegistrationHandler(id: string) {

    const logs = new LogGroup(this, 'logs', {
      encryptionKey: this.props.key,
      retention: RetentionDays.SIX_MONTHS,
    });

    const haalcentraalApiKey = Secret.fromSecretNameV2(this, 'haalcentraal-apikey', Statics.ssmHaalCentraalBRPApiKeySecret);
    const openKlantConfig = this.props.openKlantRegistrationServiceConfiguration;
    const service = new RegistrationHandlerFunction(this, 'listener', {
      timeout: Duration.seconds(30),
      description: `Notification endpoint for ${id}`,
      environment: {
        OPEN_KLANT_API_URL: openKlantConfig.openKlantUrl,
        OPEN_KLANT_API_KEY_ARN: this.params.openklant.secretArn,
        ZGW_TOKEN_CLIENT_ID_ARN: this.params.zgw.id.secretArn,
        ZGW_TOKEN_CLIENT_SECRET_ARN: this.params.zgw.secret.secretArn,
        ZAKEN_API_URL: openKlantConfig.zakenApiUrl,
        DEBUG: openKlantConfig.debug ? 'true' : 'false',
        API_KEY_ARN: this.params.authentication.secretArn,
        ROLTYPES_TO_REGISTER: openKlantConfig.roltypesToRegister.join(','),
        HAALCENTRAAL_BRP_APIKEY_ARN: haalcentraalApiKey.secretArn,
        HAALCENTRAAL_BRP_BASEURL: StringParameter.fromStringParameterName(this, 'haalcentraal-apibaseurl', Statics.ssmHaalCentraalBRPBaseUrl).stringValue,
        STRATEGY: this.props.openKlantRegistrationServiceConfiguration.strategy,
      },
      logGroup: logs,
      loggingFormat: LoggingFormat.JSON,
      systemLogLevelV2: this.props.openKlantRegistrationServiceConfiguration.debug ? SystemLogLevel.DEBUG : SystemLogLevel.INFO,
      applicationLogLevelV2: this.props.openKlantRegistrationServiceConfiguration.debug ? ApplicationLogLevel.DEBUG : ApplicationLogLevel.INFO,
    });

    this.props.key.grantEncrypt(service);
    this.params.openklant.grantRead(service);
    this.params.zgw.id.grantRead(service);
    this.params.zgw.secret.grantRead(service);
    this.params.authentication.grantRead(service);
    haalcentraalApiKey.grantRead(service);

    this.setupMonitoring(service);
    this.setupRoute(service);

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
      },
      logGroup: logs,
      loggingFormat: LoggingFormat.JSON,
      systemLogLevelV2: this.props.openKlantRegistrationServiceConfiguration.debug ? SystemLogLevel.DEBUG : SystemLogLevel.INFO,
      applicationLogLevelV2: this.props.openKlantRegistrationServiceConfiguration.debug ? ApplicationLogLevel.DEBUG : ApplicationLogLevel.INFO,
    });

    queue.grantSendMessages(service);
    this.props.key.grantEncrypt(service); // Queue is encrypted
    this.params.authentication.grantRead(service);

    new ErrorMonitoringAlarm(this, `${this.node.id}-monitor-errors-receiver`, {
      criticality: this.props.criticality,
      lambda: service,
    });

    // this.setupRoute(service); // TODO enable later to start using this lambda as the reciever endpoint
  }

  private setupVulServiceConfiguration(id: string) {
    const ssmApiKey = `/${Statics.projectName}/open-klant-registration/${id}/api-key`;
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

    return {
      openklant: openKlantApiKey,
      zgw: {
        id: zgwTokenClientId,
        secret: zgwTokenClientSecret,
      },
      authentication: serviceApiKey,
    };

  }

  private setupRoute(handler: Function) {
    this.props.api.addRoutes({
      path: this.props.openKlantRegistrationServiceConfiguration.path,
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('integration', handler, {
        parameterMapping: new ParameterMapping().appendHeader('X-Authorization', MappingValue.requestHeader('Authorization')),
      }),
    });
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

}
