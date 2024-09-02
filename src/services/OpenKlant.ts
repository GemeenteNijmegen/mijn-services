import { Duration, Token } from 'aws-cdk-lib';
import { ISecurityGroup, Port, SecurityGroup } from 'aws-cdk-lib/aws-ec2';
import { AwsLogDriver, ContainerImage, Protocol, Secret } from 'aws-cdk-lib/aws-ecs';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Secret as SecretParameter } from 'aws-cdk-lib/aws-secretsmanager';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { CacheDatabase } from '../constructs/Redis';
import { ServiceFactory, ServiceFactoryProps } from '../constructs/ServiceFactory';
import { Statics } from '../Statics';

export interface OpenKlantServiceProps {
  image: string;
  cache: CacheDatabase;
  cacheDatabaseIndex: number;
  cacheDatabaseIndexCelery: number;
  logLevel: string;
  service: ServiceFactoryProps;
  path: string;
}

export class OpenKlantService extends Construct {
  private readonly logs: LogGroup;
  private readonly props: OpenKlantServiceProps;
  private readonly serviceFactory: ServiceFactory;
  constructor(scope: Construct, id: string, props: OpenKlantServiceProps) {
    super(scope, id);
    this.props = props;
    this.serviceFactory = new ServiceFactory(this, props.service);
    this.logs = this.logGroup();

    this.setupInitalization();
    this.setupService();
  }

  private getEnvironmentConfiguration() {

    const cacheHost = this.props.cache.db.attrRedisEndpointAddress + ':' + this.props.cache.db.attrRedisEndpointPort + '/';

    return {
      DJANGO_SETTINGS_MODULE: 'openklant.conf.docker',
      DB_NAME: Statics.databaseOpenKlant,
      DB_HOST: StringParameter.valueForStringParameter(this, Statics._ssmDatabaseHostname),
      DB_PORT: StringParameter.valueForStringParameter(this, Statics._ssmDatabasePort),
      ALLOWED_HOSTS: '*', // See loadbalancer target remark above this.props.zgwCluster.alb.getDomain(),
      CACHE_DEFAULT: cacheHost + this.props.cacheDatabaseIndex,
      CACHE_AXES: cacheHost + this.props.cacheDatabaseIndex,
      SUBPATH: '/'+this.props.path,
      IS_HTTPS: 'True',
      UWSGI_PORT: this.props.service.port.toString(),

      LOG_LEVEL: this.props.logLevel,
      LOG_REQUESTS: 'True',
      LOG_QUERIES: 'False',
      DEBUG: 'True',

      // Celery
      CELERY_BROKER_URL: 'redis://' + cacheHost + this.props.cacheDatabaseIndexCelery,
      CELERY_RESULT_BACKEND: 'redis://' + cacheHost + this.props.cacheDatabaseIndexCelery,
      CELERY_LOGLEVEL: this.props.logLevel,

    };
  }

  private getSecretConfiguration() {

    // Import db credentials
    const databaseCredentials = SecretParameter.fromSecretNameV2(this, 'database-credentials', Statics._ssmDatabaseCredentials);

    // Import openklant superuser credentials
    const openKlantCredentials = SecretParameter.fromSecretNameV2(this, 'open-klant-credentials', Statics._ssmOpenKlantCredentials);

    const secrets = {
      DB_PASSWORD: Secret.fromSecretsManager(databaseCredentials, 'password'),
      DB_USER: Secret.fromSecretsManager(databaseCredentials, 'username'),

      // Generic super user creation works with running the createsuperuser command
      DJANGO_SUPERUSER_USERNAME: Secret.fromSecretsManager(openKlantCredentials, 'username'),
      DJANGO_SUPERUSER_PASSWORD: Secret.fromSecretsManager(openKlantCredentials, 'password'),
      DJANGO_SUPERUSER_EMAIL: Secret.fromSecretsManager(openKlantCredentials, 'email'),
    };
    return secrets;
  }

  /**
   * Run an initalization container once 15 minutes after creating.
   */
  private setupInitalization() {
    const runTaskAtTime = new Date(Date.parse('2024-09-02T09:59:99.000Z'));

    const task = this.serviceFactory.createTaskDefinition('init');
    task.addContainer('init', {
      image: ContainerImage.fromRegistry(this.props.image),
      healthCheck: {
        command: ['CMD-SHELL', 'exit 0'], // Not sure what to check when executing a single script
        startPeriod: Duration.seconds(30), // Give the script an inital 30 seconds to run before starting the health check
      },
      // Note: use env vars in combinations with the below command https://stackoverflow.com/questions/26963444/django-create-superuser-from-batch-file
      // Note command can only run once: 'CommandError: Error: That gebruikersnaam is already taken.'
      command: ['python', 'src/manage.py', 'createsuperuser', '--no-input', '--skip-checks'],
      portMappings: [],
      logging: new AwsLogDriver({
        streamPrefix: 'logs',
        logGroup: this.logs,
      }),
    });

    const scheduledTask = this.serviceFactory.createScheduledService(runTaskAtTime, task, 'init');
    if (!scheduledTask.task.securityGroups) {
      throw Error('Expected security groups to be set!');
    }
    this.setupConnectivity('init', scheduledTask.task.securityGroups);

  }

  setupService() {
    const task = this.serviceFactory.createTaskDefinition();
    task.addContainer('main', {
      image: ContainerImage.fromRegistry(this.props.image),
      healthCheck: {
        command: ['CMD-SHELL', 'curl -f http://127.0.0.1/ || exit 1'],
        interval: Duration.seconds(10),
      },
      portMappings: [
        {
          containerPort: this.props.service.port,
          hostPort: this.props.service.port,
          protocol: Protocol.TCP,
        },
      ],
      secrets: this.getSecretConfiguration(),
      environment: this.getEnvironmentConfiguration(),
      logging: new AwsLogDriver({
        streamPrefix: 'logs',
        logGroup: this.logs,
      }),
    });
    const service = this.serviceFactory.createService(task, this.props.path);
    this.setupConnectivity('main', service.connections.securityGroups);
  }

  private logGroup() {
    return new LogGroup(this, 'logs', {
      retention: RetentionDays.ONE_MONTH,
    });
  }

  private setupConnectivity(id: string, serviceSecurityGroups: ISecurityGroup[]) {

    const dbSecurityGroupId = StringParameter.valueForStringParameter(this, Statics._ssmDatabaseSecurityGroup);
    const dbSecurityGroup = SecurityGroup.fromSecurityGroupId(this, `db-security-group-${id}`, dbSecurityGroupId);
    const dbPort = StringParameter.valueForStringParameter(this, Statics._ssmDatabasePort);
    serviceSecurityGroups.forEach(serviceSecurityGroup => {
      dbSecurityGroup.connections.allowFrom(serviceSecurityGroup, Port.tcp(Token.asNumber(dbPort)));
    });

    const cachePort = this.props.cache.db.attrRedisEndpointPort;
    serviceSecurityGroups.forEach(serviceSecurityGroup => {
      dbSecurityGroup.connections.allowFrom(serviceSecurityGroup, Port.tcp(Token.asNumber(dbPort)));
      this.props.cache.db.vpcSecurityGroupIds?.forEach((cacheSecurityGroupId, index) => {
        const cacheSecurityGroup = SecurityGroup.fromSecurityGroupId(this, `cache-security-group-${id}-${index}`, cacheSecurityGroupId);
        cacheSecurityGroup.connections.allowFrom(serviceSecurityGroup, Port.tcp(Token.asNumber(cachePort)));
      });
    });
  }
}