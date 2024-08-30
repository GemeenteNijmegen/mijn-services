import { Duration } from 'aws-cdk-lib';
import { ContainerImage, Protocol, Secret } from 'aws-cdk-lib/aws-ecs';
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

  private readonly props: OpenKlantServiceProps;
  private readonly serviceFactory: ServiceFactory;
  constructor(scope: Construct, id: string, props: OpenKlantServiceProps) {
    super(scope, id);
    this.props = props;
    this.serviceFactory = new ServiceFactory(this, props.service);

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
    const over15minuten = new Date();
    over15minuten.setMinutes(new Date().getMinutes() + 15);

    const task = this.serviceFactory.createTaskDefinition('init');
    task.addContainer('init', {
      image: ContainerImage.fromRegistry(this.props.image),
      healthCheck: {
        command: ['CMD-SHELL', 'exit 0'], // Not sure what to check when executing a single script
        startPeriod: Duration.seconds(30), // Give the script an inital 30 seconds to run before starting the health check
      },
      essential: false,
      // Note: use env vars in combinations with the below command https://stackoverflow.com/questions/26963444/django-create-superuser-from-batch-file
      // Note command can only run once: 'CommandError: Error: That gebruikersnaam is already taken.'
      command: ['python', 'src/manage.py', 'createsuperuser', '--no-input', '--skip-checks'],
      portMappings: [],
    });

    this.serviceFactory.createScheduledService(over15minuten, task, 'init');
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
    });
    this.serviceFactory.createService(task, this.props.path);
  }


}