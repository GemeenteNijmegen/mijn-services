import { App, Stack } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { VpcLink } from 'aws-cdk-lib/aws-apigatewayv2';
import { Certificate } from 'aws-cdk-lib/aws-certificatemanager';
import { SecurityGroup, Vpc } from 'aws-cdk-lib/aws-ec2';
import { Cluster } from 'aws-cdk-lib/aws-ecs';
import { Key } from 'aws-cdk-lib/aws-kms';
import { HostedZone } from 'aws-cdk-lib/aws-route53';
import { PrivateDnsNamespace } from 'aws-cdk-lib/aws-servicediscovery';
import { IKOConfiguration } from '../src/ConfigurationInterfaces';
import { ServiceLoadBalancer } from '../src/constructs/LoadBalancer';
import { CacheDatabase } from '../src/constructs/Redis';
import { IKOService } from '../src/services/IKO';

/**
 * Stand up an IKOService with a minimal platform (just the pieces the
 * service consumes) and return the synthesized template.
 */
function synthIko(serviceConfiguration: IKOConfiguration): Template {
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

  new IKOService(stack, 'iko', {
    cache,
    hostedzone,
    key: new Key(stack, 'key'),
    certificate: Certificate.fromCertificateArn(stack, 'cert', 'arn:aws:acm:us-east-1:123456789012:certificate/test'),
    serviceConfiguration,
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

const baseConfiguration: IKOConfiguration = {
  id: 'iko',
  subdomain: 'iko',
  databaseName: 'iko',
  image: 'ghcr.io/integraal-klant-en-objectbeeld/iko:1.5.2',
  logLevel: 'INFO',
  loadbalancerPriority: 100,
  redisDatabaseNumber: 19,
};

function ikoContainer(template: Template) {
  const tasks = template.findResources('AWS::ECS::TaskDefinition');
  const containers = Object.values(tasks).flatMap((task: any) => task.Properties.ContainerDefinitions);
  const container = containers.find((c: any) => c.Name === 'iko');
  expect(container).toBeDefined();
  return container;
}

function environment(container: any): Record<string, any> {
  return Object.fromEntries(container.Environment.map((e: any) => [e.Name, e.Value]));
}

test('Runs the configured image', () => {
  const container = ikoContainer(synthIko(baseConfiguration));
  expect(container.Image).toBe('ghcr.io/integraal-klant-en-objectbeeld/iko:1.5.2');
});

test('Uses the configured redis database number and keycloak realm', () => {
  const env = environment(ikoContainer(synthIko(baseConfiguration)));
  expect(env.SPRING_DATA_REDIS_DATABASE).toBe('19');
  expect(env.SPRING_SECURITY_OAUTH2_CLIENT_PROVIDER_KEYCLOAK_ISSUERURI).toBe('https://keycloak.example.com/realms/iko');
  expect(env.SPRING_SECURITY_OAUTH2_RESOURCESERVER_JWT_ISSUERURI).toBe('https://keycloak.example.com/realms/iko');
  expect(env.SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_KEYCLOAK_CLIENTID).toBe('iko');
  expect(env.SERVER_SERVLET_SESSION_COOKIE_SECURE).toBe('true');
  expect(env.IKO_DEBUG_SHOW_HEADERS).toBe('false');
});

test('Keycloak realm and client can be overridden', () => {
  const env = environment(ikoContainer(synthIko({
    ...baseConfiguration,
    keycloakRealm: 'other-realm',
    keycloakClientId: 'other-client',
  })));
  expect(env.SPRING_SECURITY_OAUTH2_CLIENT_PROVIDER_KEYCLOAK_ISSUERURI).toBe('https://keycloak.example.com/realms/other-realm');
  expect(env.SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_KEYCLOAK_CLIENTID).toBe('other-client');
});

test('Credentials are passed as secrets, not as plain environment variables', () => {
  const container = ikoContainer(synthIko(baseConfiguration));
  const secretNames = container.Secrets.map((s: any) => s.Name);
  const credentialNames = [
    'SPRING_DATASOURCE_USERNAME',
    'SPRING_DATASOURCE_PASSWORD',
    'SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_KEYCLOAK_CLIENTSECRET',
    'IKO_CRYPTO_KEY',
  ];
  expect(secretNames).toEqual(expect.arrayContaining(credentialNames));
  const env = environment(container);
  credentialNames.forEach(name => expect(env[name]).toBeUndefined());
});

test('Is exposed on its subdomain with the configured priority', () => {
  const template = synthIko(baseConfiguration);
  template.hasResourceProperties('AWS::ElasticLoadBalancingV2::ListenerRule', {
    Priority: 100,
    Conditions: Match.arrayWith([
      Match.objectLike({
        Field: 'host-header',
        HostHeaderConfig: { Values: ['iko.example.com'] },
      }),
    ]),
  });
  template.hasResourceProperties('AWS::CloudFront::Distribution', {
    DistributionConfig: Match.objectLike({
      Aliases: ['iko.example.com'],
    }),
  });
});

test('Load balancer health check uses the management port', () => {
  const template = synthIko(baseConfiguration);
  template.hasResourceProperties('AWS::ElasticLoadBalancingV2::TargetGroup', {
    Port: 8080,
    HealthCheckPort: '9090',
    HealthCheckPath: '/actuator/health/readiness',
  });
});

test('Creates its own database', () => {
  const template = synthIko(baseConfiguration);
  template.resourceCountIs('Custom::SingleDatabase', 1);
  template.hasResourceProperties('AWS::SecretsManager::Secret', {
    Name: '/mijn-services/internal/database/iko/credentials',
  });
});

test('Load balancer can reach the management port', () => {
  const template = synthIko(baseConfiguration);
  template.hasResourceProperties('AWS::EC2::SecurityGroupIngress', {
    IpProtocol: 'tcp',
    FromPort: 9090,
    ToPort: 9090,
    SourceSecurityGroupId: Match.anyValue(),
  });
});
