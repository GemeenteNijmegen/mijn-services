import { App, Stack } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { VpcLink } from 'aws-cdk-lib/aws-apigatewayv2';
import { SecurityGroup, Vpc } from 'aws-cdk-lib/aws-ec2';
import { Cluster } from 'aws-cdk-lib/aws-ecs';
import { Key } from 'aws-cdk-lib/aws-kms';
import { HostedZone } from 'aws-cdk-lib/aws-route53';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { PrivateDnsNamespace } from 'aws-cdk-lib/aws-servicediscovery';
import { ObjectsConfiguration } from '../src/ConfigurationInterfaces';
import { ServiceLoadBalancer } from '../src/constructs/LoadBalancer';
import { CacheDatabase } from '../src/constructs/Redis';
import { ObjectsService } from '../src/services/Objects';

const MIGRATION_FAMILY = 'mijn-services-objects-migrate';

/**
 * Stand up an ObjectsService with a minimal platform (just the pieces the
 * service consumes) and return the synthesized template.
 */
function synthObjects(serviceConfiguration: ObjectsConfiguration): Template {
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

  new ObjectsService(stack, 'objects', {
    cache,
    cacheDatabaseIndex: 9,
    cacheDatabaseIndexCelery: 10,
    hostedzone,
    path: 'objects',
    key: new Key(stack, 'key'),
    dockerhubCredentials: new Secret(stack, 'dockerhub'),
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

  return Template.fromStack(stack);
}

const baseConfiguration: ObjectsConfiguration = {
  image: 'maykinmedia/objects-api:3.0.0',
  logLevel: 'INFO',
};

test('No migration task definition is created without a migrationImage', () => {
  const template = synthObjects(baseConfiguration);
  template.resourcePropertiesCountIs('AWS::ECS::TaskDefinition', {
    Family: MIGRATION_FAMILY,
  }, 0);
});

test('A standalone migration task definition is created when migrationImage is set', () => {
  const template = synthObjects({
    ...baseConfiguration,
    migrationImage: 'maykinmedia/objects-api:3.6.1',
  });

  // Pinned to the migration image (not the service image) and runs migrate.
  template.hasResourceProperties('AWS::ECS::TaskDefinition', {
    Family: MIGRATION_FAMILY,
    ContainerDefinitions: Match.arrayWith([
      Match.objectLike({
        Name: 'migrate',
        Image: 'maykinmedia/objects-api:3.6.1',
        Command: ['python', 'src/manage.py', 'migrate', '--noinput'],
      }),
    ]),
  });
});

test('The migration task definition is not attached to any ECS service', () => {
  const template = synthObjects({
    ...baseConfiguration,
    migrationImage: 'maykinmedia/objects-api:3.6.1',
  });

  // Only the main + celery services exist; nothing wires up the migrate task.
  const services = template.findResources('AWS::ECS::Service');
  expect(Object.keys(services)).toHaveLength(2);
});
