import { App, Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { VpcLink } from 'aws-cdk-lib/aws-apigatewayv2';
import { Certificate } from 'aws-cdk-lib/aws-certificatemanager';
import { SecurityGroup, Vpc } from 'aws-cdk-lib/aws-ec2';
import { Cluster } from 'aws-cdk-lib/aws-ecs';
import { Key } from 'aws-cdk-lib/aws-kms';
import { HostedZone } from 'aws-cdk-lib/aws-route53';
import { PrivateDnsNamespace } from 'aws-cdk-lib/aws-servicediscovery';
import { ServiceLoadBalancer } from '../src/constructs/LoadBalancer';
import { GZACService } from '../src/services/GZAC';

function synthGzac(): Template {
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

  new GZACService(stack, 'gzac-backend-1', {
    hostedzone,
    key: new Key(stack, 'key'),
    certificate: Certificate.fromCertificateArn(stack, 'certificate', 'arn:aws:acm:us-east-1:123456789012:certificate/test'),
    serviceConfiguration: {
      id: 'gzac-backend-1',
      subdomain: 'gzac-api',
      image: 'ghcr.io/gemeentenijmegen/gzac-backend:1.0.0',
      logLevel: 'INFO',
      loadbalancerPriority: 80,
      databaseName: 'gzac',
    },
    service: {
      cluster,
      link: vpcLink,
      namespace,
      loadbalancer,
      vpcLinkSecurityGroup,
      port: 8080,
    },
  });

  return Template.fromStack(stack);
}

function containerDefinition(template: Template, name: string) {
  const taskDefinitions = Object.values(template.findResources('AWS::ECS::TaskDefinition'));
  const containers = taskDefinitions.flatMap((taskDefinition: any) => taskDefinition.Properties.ContainerDefinitions);
  const container = containers.find((c: any) => c.Name === name);
  expect(container).toBeDefined();
  return container;
}

function secretLogicalId(template: Template) {
  const secrets = template.findResources('AWS::SecretsManager::Secret', {
    Properties: {
      Description: 'Credentials for the GZAC RabbitMQ broker',
      GenerateSecretString: {
        ExcludePunctuation: true,
        SecretStringTemplate: JSON.stringify({ username: 'gzac' }),
        GenerateStringKey: 'password',
      },
    },
  });
  const ids = Object.keys(secrets);
  expect(ids).toHaveLength(1);
  return ids[0];
}

const template = synthGzac();

test('RabbitMQ credentials are generated in Secrets Manager', () => {
  secretLogicalId(template);
});

test('RabbitMQ definitions contain no password hash', () => {
  const rabbit = containerDefinition(template, 'gzac-rabbit-mq');
  const definitions = rabbit.Environment.find((e: any) => e.Name === 'RABBITMQ_DEFINITIONS');
  const users = JSON.parse(definitions.Value).users;
  expect(users).toEqual([expect.objectContaining({
    name: 'gzac',
    password_hash: '__RABBITMQ_PASSWORD_HASH__',
  })]);
});

test('RabbitMQ broker reads its password from the secret', () => {
  const secretId = secretLogicalId(template);
  const rabbit = containerDefinition(template, 'gzac-rabbit-mq');
  expect(rabbit.Secrets).toEqual(expect.arrayContaining([{
    Name: 'RABBITMQ_PASSWORD',
    ValueFrom: { 'Fn::Join': ['', [{ Ref: secretId }, ':password::']] },
  }]));
  expect(rabbit.Command[0]).toContain('rabbitmqctl -q hash_password');
  expect(rabbit.Command[0]).toContain('__RABBITMQ_PASSWORD_HASH__');
  expect(rabbit.Command[0]).toContain('load_definitions');
});

test('No default guest user is configured', () => {
  expect(JSON.stringify(template.toJSON())).not.toContain('guest');
});

test('GZAC backend reads the RabbitMQ credentials from the secret', () => {
  const secretId = secretLogicalId(template);
  const backend = containerDefinition(template, 'gzac-backend');
  expect(backend.Secrets).toEqual(expect.arrayContaining([
    { Name: 'SPRING_RABBITMQ_USERNAME', ValueFrom: { 'Fn::Join': ['', [{ Ref: secretId }, ':username::']] } },
    { Name: 'SPRING_RABBITMQ_PASSWORD', ValueFrom: { 'Fn::Join': ['', [{ Ref: secretId }, ':password::']] } },
  ]));
  const environmentNames = backend.Environment.map((e: any) => e.Name);
  expect(environmentNames).not.toContain('SPRING_RABBITMQ_USERNAME');
  expect(environmentNames).not.toContain('SPRING_RABBITMQ_PASSWORD');
});

test('Existing GZAC stateful resources keep their logical ids', () => {
  const ids = Object.keys(template.toJSON().Resources);
  expect(ids).toEqual(expect.arrayContaining([
    'gzacbackend1logs8F77D99C',
    'gzacbackend1dbcredentials0FBFC9A0',
    'gzacbackend1dbFF9314D4',
    'gzacbackend1gzacbackendm2mcredentials57214192',
    'gzacbackend1gzacpluginencryptionsecret2F1120AE',
    'gzacbackend1rabbitmqService64522928',
    'gzacbackend1gzacserviceServiceBA83B65F',
  ]));
});
