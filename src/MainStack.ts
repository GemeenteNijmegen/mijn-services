import { GemeenteNijmegenVpc } from '@gemeentenijmegen/aws-constructs';
import { Stack, StackProps } from 'aws-cdk-lib';
import { Effect, PolicyStatement, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { Key } from 'aws-cdk-lib/aws-kms';
import { HostedZone, IHostedZone } from 'aws-cdk-lib/aws-route53';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { Configurable, Configuration } from './ConfigurationInterfaces';
import { ApiGateway } from './constructs/ApiGateway';
import { CloudfrontDistributionForLoadBalancer } from './constructs/CloudfrontDistributionForLoadBalancer';
import { ContainerPlatform } from './constructs/ContainerPlatform';
import { DnsRecords } from './constructs/DnsRecords';
import { CacheDatabase } from './constructs/Redis';
import { GZACService } from './services/GZAC';
import { GZACFrontendService } from './services/GZACFrontend';
import { KeyCloakService } from './services/KeyCloak';
import { ObjectsService } from './services/Objects';
import { ObjecttypesService } from './services/Objecttypes';
import { OpenKlantService } from './services/OpenKlant';
import { OpenKlantRegistrationService } from './services/OpenKlantRegistrationService/OpenKlantRegistrationService';
import { OpenNotificatiesService } from './services/OpenNotificaties';
import { OpenProductService } from './services/OpenProduct/OpenProduct';
import { OpenZaakService } from './services/OpenZaak';
import { OMCService } from './services/OutputManagementComponent';
import { Statics } from './Statics';

interface MainStackProps extends StackProps, Configurable { }

/**
 * Main stack of this project
 * Constains resources such as loadbalancer, cloudfront, apigateway, fargate cluster
 */
export class MainStack extends Stack {
  private readonly configuration: Configuration;
  private readonly hostedzone: IHostedZone;
  private readonly vpc: GemeenteNijmegenVpc;
  private readonly cache: CacheDatabase;
  private readonly key: Key;
  constructor(scope: Construct, id: string, props: MainStackProps) {
    super(scope, id, props);
    this.configuration = props.configuration;

    this.key = this.setupGeneralEncryptionKey();
    this.hostedzone = this.importHostedzone();
    this.vpc = new GemeenteNijmegenVpc(this, 'vpc');

    this.cache = new CacheDatabase(this, 'cache-database', {
      vpc: this.vpc.vpc,
    });

    new DnsRecords(this, 'dns', {
      hostedzone: this.hostedzone,
      cnameRecords: this.configuration.cnameRecords,
    });

    const api = new ApiGateway(this, 'api-gateway', {
      hostedzone: this.hostedzone,
      vpc: this.vpc.vpc,
      alternativeDomainNames: props.configuration.alternativeDomainNames,
    });

    const platform = new ContainerPlatform(this, 'containers', {
      vpc: this.vpc.vpc,
      certificate: api.certificate,
      hostedZone: this.hostedzone,
    });

    const domains = [this.hostedzone.zoneName];
    if (props.configuration.alternativeDomainNames) {
      domains.push( ...props.configuration.alternativeDomainNames);
    }
    new CloudfrontDistributionForLoadBalancer(this, 'distribution', {
      certificate: api.certificate,
      domains,
      loadbalancer: platform.loadBalancer.alb,
    });

    this.openKlantService(api, platform);
    this.openNotificatiesServices(api, platform);
    this.openZaakServices(api, platform);
    this.outputManagementComponent(api, platform);
    this.openKlantRegistrationServices(api);
    this.objecttypesService(api, platform);
    this.objectsService(api, platform);
    this.keyCloakService(api, platform);
    this.gzacService(api, platform);
    this.gzacFrontendService(api, platform);
    this.openProductServices(api, platform);
  }

  private openKlantService(api: ApiGateway, platform: ContainerPlatform) {
    if (!this.configuration.openklant) {
      console.warn(
        'No open-klant configuration provided. Skipping creation of open klant service!',
      );
      return;
    }
    new OpenKlantService(this, 'open-klant', {
      hostedzone: this.hostedzone,
      key: this.key,
      cache: this.cache,
      cacheDatabaseIndex: 1,
      cacheDatabaseIndexCelery: 2,
      image: this.configuration.openklant.image,
      logLevel: this.configuration.openklant.logLevel,
      alternativeDomainNames: this.configuration.alternativeDomainNames,
      serviceConfiguration: this.configuration.openklant,
      path: 'open-klant',
      service: {
        api: api.api,
        cluster: platform.cluster,
        link: platform.vpcLink,
        namespace: platform.namespace,
        loadbalancer: platform.loadBalancer,
        port: 8080,
        vpcLinkSecurityGroup: platform.vpcLinkSecurityGroup,
      },
    });
  }

  private openNotificatiesServices(
    api: ApiGateway,
    platform: ContainerPlatform,
  ) {
    if (!this.configuration.openNotificaties) {
      console.warn(
        'No open-notificaties configuration provided. Skipping creation of open notification service!',
      );
      return;
    }
    new OpenNotificatiesService(this, 'open-notificaties', {
      hostedzone: this.hostedzone,
      key: this.key,
      cache: this.cache,
      cacheDatabaseIndex: 3,
      cacheDatabaseIndexCelery: 4,
      alternativeDomainNames: this.configuration.alternativeDomainNames,
      path: 'open-notificaties',
      service: {
        api: api.api,
        cluster: platform.cluster,
        link: platform.vpcLink,
        namespace: platform.namespace,
        loadbalancer: platform.loadBalancer,
        port: 8080,
        vpcLinkSecurityGroup: platform.vpcLinkSecurityGroup,
      },
      openNotificationsConfiguration: this.configuration.openNotificaties,
    });
  }

  private openZaakServices(api: ApiGateway, platform: ContainerPlatform) {
    if (!this.configuration.openZaak) {
      console.warn(
        'No open-zaak configuration provided. Skipping creation of open zaak service!',
      );
      return;
    }
    new OpenZaakService(this, 'open-zaak', {
      hostedzone: this.hostedzone,
      key: this.key,
      cache: this.cache,
      cacheDatabaseIndex: 5,
      cacheDatabaseIndexCelery: 6,
      alternativeDomainNames: this.configuration.alternativeDomainNames,
      path: 'open-zaak',
      service: {
        api: api.api,
        cluster: platform.cluster,
        link: platform.vpcLink,
        namespace: platform.namespace,
        loadbalancer: platform.loadBalancer,
        port: 8080,
        vpcLinkSecurityGroup: platform.vpcLinkSecurityGroup,
      },
      openZaakConfiguration: this.configuration.openZaak,
    });
  }

  private outputManagementComponent(
    api: ApiGateway,
    platform: ContainerPlatform,
  ) {
    if (!this.configuration.outputManagementComponents) {
      console.warn('No OMC configuration provided. Skipping creation of OMC!');
      return;
    }
    for (const omc of this.configuration.outputManagementComponents) {
      new OMCService(this, omc.cdkId, {
        omcConfiguration: omc,
        key: this.key,
        service: {
          api: api.api,
          cluster: platform.cluster,
          link: platform.vpcLink,
          namespace: platform.namespace,
          loadbalancer: platform.loadBalancer,
          port: 8080,
          vpcLinkSecurityGroup: platform.vpcLinkSecurityGroup,
        },
      });
    }
  }

  private objecttypesService(api: ApiGateway, platform: ContainerPlatform) {
    if (!this.configuration.objecttypesService) {
      console.warn(
        'No objecttypes configuration provided. Skipping creation of objecttypes service!',
      );
      return;
    }
    new ObjecttypesService(this, 'objecttypes', {
      hostedzone: this.hostedzone,
      key: this.key,
      cache: this.cache,
      cacheDatabaseIndex: 7,
      cacheDatabaseIndexCelery: 8,
      alternativeDomainNames: this.configuration.alternativeDomainNames,
      path: 'objecttypes',
      service: {
        api: api.api,
        cluster: platform.cluster,
        link: platform.vpcLink,
        namespace: platform.namespace,
        loadbalancer: platform.loadBalancer,
        port: 8080,
        vpcLinkSecurityGroup: platform.vpcLinkSecurityGroup,
      },
      serviceConfiguration: this.configuration.objecttypesService,
    });
  }

  private objectsService(api: ApiGateway, platform: ContainerPlatform) {
    if (!this.configuration.objectsService) {
      console.warn(
        'No objects configuration provided. Skipping creation of objects service!',
      );
      return;
    }
    new ObjectsService(this, 'objects', {
      hostedzone: this.hostedzone,
      key: this.key,
      cache: this.cache,
      cacheDatabaseIndex: 9,
      cacheDatabaseIndexCelery: 10,
      alternativeDomainNames: this.configuration.alternativeDomainNames,
      path: 'objects',
      service: {
        api: api.api,
        cluster: platform.cluster,
        link: platform.vpcLink,
        namespace: platform.namespace,
        loadbalancer: platform.loadBalancer,
        port: 8080,
        vpcLinkSecurityGroup: platform.vpcLinkSecurityGroup,
      },
      serviceConfiguration: this.configuration.objectsService,
    });
  }
  private keyCloakService(api: ApiGateway, platform: ContainerPlatform) {
    if (!this.configuration.keyCloackService) {
      console.warn(
        'No keycloak configuration provided. Skipping creation of keycloak service!',
      );
      return;
    }
    new KeyCloakService(this, 'keycloak', {
      hostedzone: this.hostedzone,
      key: this.key,
      alternativeDomainNames: this.configuration.alternativeDomainNames,
      path: 'keycloak',
      service: {
        api: api.api,
        cluster: platform.cluster,
        link: platform.vpcLink,
        namespace: platform.namespace,
        loadbalancer: platform.loadBalancer,
        port: 8080,
        vpcLinkSecurityGroup: platform.vpcLinkSecurityGroup,
      },
      serviceConfiguration: this.configuration.keyCloackService,
    });
  }

  private gzacFrontendService(api: ApiGateway, platform: ContainerPlatform) {
    if (!this.configuration.gzacFrontendService) {
      console.warn('no gzac provided. Skipping creation of objects service!');
      return;
    }
    new GZACFrontendService(this, 'gzac-frontend', {
      hostedzone: this.hostedzone,
      key: this.key,
      alternativeDomainNames: this.configuration.alternativeDomainNames,
      path: 'gzac-ui',
      service: {
        api: api.api,
        cluster: platform.cluster,
        link: platform.vpcLink,
        namespace: platform.namespace,
        loadbalancer: platform.loadBalancer,
        port: 8080,
        vpcLinkSecurityGroup: platform.vpcLinkSecurityGroup,
      },
      serviceConfiguration: this.configuration.gzacFrontendService,
    });
  }

  private gzacService(api: ApiGateway, platform: ContainerPlatform) {
    if (!this.configuration.gzacService) {
      console.warn('no gzac provided. Skipping creation of objects service!');

      return;
    }

    new GZACService(this, 'gzac', {
      hostedzone: this.hostedzone,
      key: this.key,
      alternativeDomainNames: this.configuration.alternativeDomainNames,
      path: 'api',
      service: {
        api: api.api,
        cluster: platform.cluster,
        link: platform.vpcLink,
        namespace: platform.namespace,
        loadbalancer: platform.loadBalancer,
        port: 8080,
        vpcLinkSecurityGroup: platform.vpcLinkSecurityGroup,
      },
      serviceConfiguration: this.configuration.gzacService,
    });
  }

  private openKlantRegistrationServices(api: ApiGateway) {
    if (!this.configuration.openKlantRegistrationServices) {
      console.warn(
        'No openKlantRegistrationServices configuration provided. Skipping creation!',
      );
      return;
    }
    for (const openKlantRegistrationService of this.configuration.openKlantRegistrationServices) {
      new OpenKlantRegistrationService(this, openKlantRegistrationService.cdkId,
        {
          api: api.api,
          openKlantRegistrationServiceConfiguration:
            openKlantRegistrationService,
          criticality: this.configuration.criticality,
          key: this.key,
        },
      );
    }
  }

  private openProductServices(api: ApiGateway, platform: ContainerPlatform) {
    if (!this.configuration.openProductServices) {
      console.warn('No openProduct configuration provided. Skipping creation!');
      return;
    }
    new OpenProductService(this, 'open-product', {
      hostedzone: this.hostedzone,
      key: this.key,
      cache: this.cache,
      cacheDatabaseIndex: 11,
      cacheDatabaseIndexCelery: 12,
      alternativeDomainNames: this.configuration.alternativeDomainNames,
      path: 'open-product',
      service: {
        api: api.api,
        cluster: platform.cluster,
        link: platform.vpcLink,
        namespace: platform.namespace,
        loadbalancer: platform.loadBalancer,
        port: 8080,
        vpcLinkSecurityGroup: platform.vpcLinkSecurityGroup,
      },
      openProductConfiguration: this.configuration.openProductServices,
    });
  }
  private importHostedzone() {
    return HostedZone.fromHostedZoneAttributes(this, 'hostedzone', {
      hostedZoneId: StringParameter.valueForStringParameter(
        this,
        Statics.ssmAccountRootHostedZoneId,
      ),
      zoneName: StringParameter.valueForStringParameter(
        this,
        Statics.ssmAccountRootHostedZoneName,
      ),
    });
  }

  private setupGeneralEncryptionKey() {
    const key = new Key(this, 'key', {
      description: 'General encryption key used for mijn-services',
    });

    key.addAlias('mijn-services-general-encryption');

    const stack = Stack.of(this);
    key.addToResourcePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        sid: 'Allow KMS key usage by CloudWatch in this account',
        principals: [
          new ServicePrincipal(`logs.${stack.region}.amazonaws.com`),
        ],
        actions: [
          'kms:Encrypt*',
          'kms:Decrypt*',
          'kms:ReEncrypt*',
          'kms:GenerateDataKey*',
          'kms:Describe*',
        ],
        resources: ['*'],
        conditions: {
          ArnLike: {
            'kms:EncryptionContext:aws:logs:arn': `arn:aws:logs:${stack.region}:${stack.account}:*`,
          },
        },
      }),
    );

    return key;
  }
}


