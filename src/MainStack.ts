import { GemeenteNijmegenVpc } from '@gemeentenijmegen/aws-constructs';
import { Stack, StackProps } from 'aws-cdk-lib';
import { HostedZone, IHostedZone } from 'aws-cdk-lib/aws-route53';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { Configurable } from './Configuration';
import { ApiGateway } from './constructs/ApiGateway';
import { ContainerPlatform } from './constructs/ContainerPlatform';
import { DnsRecords } from './constructs/DnsRecords';
import { CacheDatabase } from './constructs/Redis';
import { OpenKlantService } from './services/OpenKlant';
import { Statics } from './Statics';

interface MainStackProps extends StackProps, Configurable {}

export class MainStack extends Stack {
  private readonly configuration;
  private readonly hostedzone: IHostedZone;
  private readonly vpc: GemeenteNijmegenVpc;
  private readonly cache: CacheDatabase;
  constructor(scope: Construct, id: string, props: MainStackProps) {
    super(scope, id, props);
    this.configuration = props.configuration;


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
    });

    const platform = new ContainerPlatform(this, 'containers', {
      vpc: this.vpc.vpc,
    });

    this.openKlantService(api, platform);
  }


  private openKlantService(api: ApiGateway, platform: ContainerPlatform) {
    new OpenKlantService(this, 'open-klant', {
      cache: this.cache,
      cacheDatabaseIndex: 1,
      cacheDatabaseIndexCelery: 2,
      image: this.configuration.openklant.image,
      logLevel: this.configuration.openklant.logLevel,
      path: 'open-klant',
      service: {
        api: api.api,
        cluster: platform.cluster,
        link: platform.vpcLink,
        namespace: platform.namespace,
        port: 80,
        vpcLinkSecurityGroup: platform.vpcLinkSecurityGroup,
      },
    });
  }

  private importHostedzone() {
    return HostedZone.fromHostedZoneAttributes(this, 'hostedzone', {
      hostedZoneId: StringParameter.valueForStringParameter(this, Statics.ssmAccountRootHostedZoneId),
      zoneName: StringParameter.valueForStringParameter(this, Statics.ssmAccountRootHostedZoneName),
    });
  }


}