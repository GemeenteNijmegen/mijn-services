import { PermissionsBoundaryAspect } from '@gemeentenijmegen/aws-constructs';
import { Aspects, Stage, StageProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Configurable } from './Configuration';
import { DatabaseStack } from './DatabaseStack';
import { MainStack } from './MainStack';
import { Statics } from './Statics';
import { UsEastStack } from './UsEastStack';

interface MijnServicesStageProps extends StageProps, Configurable {}

export class MijnServicesStage extends Stage {

  constructor(scope: Construct, id: string, props: MijnServicesStageProps) {
    super(scope, id, props);
    Aspects.of(this).add(new PermissionsBoundaryAspect());

    /**
     * Some resources must be in us-east-1 for AWS to be able to attach
     * them to the CloudFront distribution. This will be the case untill the
     * AWS European Sovereign Cloud is available and supports CloudFront.
     * See: https://aws.amazon.com/blogs/security/aws-digital-sovereignty-pledge-announcing-a-new-independent-sovereign-cloud-in-europe/
     */
    const usstack = new UsEastStack(this, 'us-east-stack', { // Translates to mijn-services-us-east-stack
      env: {
        account: props.configuration.deploymentEnvironment.account,
        region: 'us-east-1',
      },
      configuration: props.configuration,
    });

    /**
     * Creates the database instance (only one currenlty)
     * and create the databases.
     */
    const databasestack = new DatabaseStack(this, 'database-stack', {
      env: props.configuration.deploymentEnvironment,
      configuration: props.configuration,
      databases: Statics.databases,
    });

    /**
     * Main stack of this project
     * Constains resources such as loadbalancer, cloudfront, apigateway, fargate cluster
     */
    const mainstack = new MainStack(this, 'stack', { // Translates to mijn-services-stack
      env: props.configuration.deploymentEnvironment,
      configuration: props.configuration,
    });
    mainstack.addDependency(usstack, 'Cloudfront cert must exist before distribution is created');
    mainstack.addDependency(databasestack, 'Services in main stack need the DB to be created');

  }

}