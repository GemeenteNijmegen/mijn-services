import { App, NestedStack, Stack } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { VpcLink } from 'aws-cdk-lib/aws-apigatewayv2';
import { Certificate } from 'aws-cdk-lib/aws-certificatemanager';
import { SecurityGroup, Vpc } from 'aws-cdk-lib/aws-ec2';
import { Cluster } from 'aws-cdk-lib/aws-ecs';
import { Key } from 'aws-cdk-lib/aws-kms';
import { HostedZone } from 'aws-cdk-lib/aws-route53';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { PrivateDnsNamespace } from 'aws-cdk-lib/aws-servicediscovery';
import { OpenNotificatiesConfigurationV2 } from '../src/ConfigurationInterfaces';
import { ServiceLoadBalancer } from '../src/constructs/LoadBalancer';
import { CacheDatabase } from '../src/constructs/Redis';
import { OpenNotificatiesV2Service } from '../src/services/OpenNotificatiesV2';

interface SynthResult {
  /** Template of the stack containing the platform (loadbalancer, cache) */
  parent: Template;
  /** Template of the stack containing the open notificaties service */
  service: Template;
}

/**
 * Stand up an OpenNotificatiesV2Service with a minimal platform. Optionally
 * places the service in a nested stack, the way the main stack does.
 */
function synth(serviceConfiguration: OpenNotificatiesConfigurationV2, nested = false): SynthResult {
  const app = new App();
  const stack = new Stack(app, 'test-stack', {
    env: { account: '123456789012', region: 'eu-central-1' },
  });

  const vpc = new Vpc(stack, 'vpc');
  const hostedzone = HostedZone.fromHostedZoneAttributes(stack, 'hostedzone', {
    hostedZoneId: 'Z0123456789ABCDEFGHIJ',
    zoneName: 'example.com',
  });

  const namespace = new PrivateDnsNamespace(stack, 'namespace', {
    name: 'mijn-services.local',
    vpc,
  });
  const vpcLinkSecurityGroup = new SecurityGroup(stack, 'vpc-link-sg', { vpc });
  const vpcLink = new VpcLink(stack, 'vpc-link', { vpc, securityGroups: [vpcLinkSecurityGroup] });
  const cluster = new Cluster(stack, 'cluster', { vpc });
  const loadbalancer = new ServiceLoadBalancer(stack, 'lb', { vpc, hostedzone });
  const cache = new CacheDatabase(stack, 'cache', { vpc });
  const dockerhubCredentials = new Secret(stack, 'dockerhub');

  const scope = nested ? new NestedStack(stack, 'open-notificaties-stack') : stack;
  new OpenNotificatiesV2Service(scope, serviceConfiguration.id, {
    cache,
    hostedzone,
    key: new Key(stack, 'key'),
    certificate: Certificate.fromCertificateArn(stack, 'cert', 'arn:aws:acm:us-east-1:123456789012:certificate/test'),
    dockerhubCredentials,
    serviceConfiguration,
    service: {
      cluster,
      link: vpcLink,
      namespace,
      loadbalancer,
      vpcLinkSecurityGroup,
      port: 8000,
    },
  });

  return {
    parent: Template.fromStack(stack),
    service: Template.fromStack(Stack.of(scope)),
  };
}

function synthService(serviceConfiguration: OpenNotificatiesConfigurationV2): Template {
  return synth(serviceConfiguration).service;
}

const baseConfiguration: OpenNotificatiesConfigurationV2 = {
  id: 'test-open-notificaties',
  subdomain: 'test-open-notificaties',
  databaseName: 'test-open-notificaties',
  image: 'openzaak/open-notificaties:1.16.2',
  logLevel: 'INFO',
  loadbalancerPriority: 110,
  redisCacheDatabaseNumber: 20,
  redisCeleryDatabaseNumber: 21,
};

function taskDefinition(template: Template) {
  const tasks = Object.values(template.findResources('AWS::ECS::TaskDefinition'));
  expect(tasks).toHaveLength(1);
  return tasks[0] as any;
}

function containers(template: Template): any[] {
  return taskDefinition(template).Properties.ContainerDefinitions;
}

function container(template: Template, name: string) {
  const found = containers(template).find((c: any) => c.Name === name);
  expect(found).toBeDefined();
  return found;
}

function environment(definition: any): Record<string, any> {
  return Object.fromEntries(definition.Environment.map((e: any) => [e.Name, e.Value]));
}

/** Join a CloudFormation Fn::Join value into a string, rendering tokens as <token> */
function joined(value: any): string {
  if (typeof value === 'string') {
    return value;
  }
  if (value['Fn::Join']) {
    return value['Fn::Join'][1].map((part: any) => typeof part === 'string' ? part : '<token>').join(value['Fn::Join'][0]);
  }
  return '<token>';
}

test('Runs as a single service with web, celery and beat in one task', () => {
  const template = synthService(baseConfiguration);
  template.resourceCountIs('AWS::ECS::Service', 1);
  expect(containers(template).map((c: any) => c.Name).sort()).toEqual(['celery', 'celery-beat', 'web']);
  containers(template).forEach((c: any) => {
    expect(c.Image).toBe('openzaak/open-notificaties:1.16.2');
    expect(c.Essential).toBe(true);
  });
});

test('Worker and beat run their celery scripts and wait for a healthy web container', () => {
  const template = synthService(baseConfiguration);
  expect(container(template, 'web').Command).toBeUndefined();
  expect(container(template, 'web').HealthCheck).toBeDefined();
  expect(container(template, 'celery').Command).toEqual(['/celery_worker.sh']);
  expect(container(template, 'celery').HealthCheck.Command.join(' ')).toContain('check_celery_worker_liveness.py');
  expect(container(template, 'celery-beat').Command).toEqual(['/celery_beat.sh']);
  ['celery', 'celery-beat'].forEach(name => {
    expect(container(template, name).DependsOn).toEqual([{ ContainerName: 'web', Condition: 'HEALTHY' }]);
  });
});

test('Uses redis as broker on its own databases and no rabbitmq', () => {
  const template = synthService(baseConfiguration);
  containers(template).forEach((c: any) => {
    const env = environment(c);
    expect(joined(env.CELERY_BROKER_URL)).toMatch(/^redis:\/\/.*\/21$/);
    expect(joined(env.CELERY_RESULT_BACKEND)).toMatch(/^redis:\/\/.*\/21$/);
    expect(joined(env.CACHE_DEFAULT)).toMatch(/\/20$/);
    expect(env.RABBITMQ_HOST).toBeUndefined();
  });
  expect(JSON.stringify(template.toJSON())).not.toMatch(/amqp|rabbit/i);
});

test('Knows its own domain', () => {
  const env = environment(container(synthService(baseConfiguration), 'web'));
  expect(env.SITE_DOMAIN).toBe('test-open-notificaties.example.com');
  expect(env.CSRF_TRUSTED_ORIGINS).toBe('https://test-open-notificaties.example.com');
  expect(env.SUBPATH).toBeUndefined();
  expect(env.LOG_NOTIFICATIONS_IN_DB).toBe('False');
});

test('Credentials are passed as secrets, not as plain environment variables', () => {
  const web = container(synthService(baseConfiguration), 'web');
  const secretNames = web.Secrets.map((s: any) => s.Name);
  const credentialNames = ['SECRET_KEY', 'DB_USER', 'DB_PASSWORD'];
  expect(secretNames).toEqual(expect.arrayContaining(credentialNames));
  const env = environment(web);
  credentialNames.forEach(name => expect(env[name]).toBeUndefined());
});

test('Task size and count default and can be overridden', () => {
  const defaults = synthService(baseConfiguration);
  expect(taskDefinition(defaults).Properties.Cpu).toBe('512');
  expect(taskDefinition(defaults).Properties.Memory).toBe('1536');
  defaults.hasResourceProperties('AWS::ECS::Service', { DesiredCount: 1 });

  const overridden = synthService({
    ...baseConfiguration,
    persistNotifications: true,
    taskSize: { cpu: '1024', memory: '2048', desiredTaskCount: 2 },
  });
  expect(taskDefinition(overridden).Properties.Cpu).toBe('1024');
  expect(taskDefinition(overridden).Properties.Memory).toBe('2048');
  overridden.hasResourceProperties('AWS::ECS::Service', { DesiredCount: 2 });
  expect(environment(container(overridden, 'web')).LOG_NOTIFICATIONS_IN_DB).toBe('True');
});

test('Creates its own database', () => {
  const template = synthService(baseConfiguration);
  template.resourceCountIs('Custom::SingleDatabase', 1);
  template.hasResourceProperties('AWS::SecretsManager::Secret', {
    Name: '/mijn-services/internal/database/test-open-notificaties/credentials',
  });
});
