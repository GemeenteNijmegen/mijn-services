import { PermissionsBoundaryAspect } from '@gemeentenijmegen/aws-constructs';
import { Aspects, Stage, StageProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Configurable } from './Configuration';
import { DatabaseStack } from './DatabaseStack';
import { MainStack } from './MainStack';

interface MijnServicesStageProps extends StageProps, Configurable {}

export class MijnServicesStage extends Stage {

  constructor(scope: Construct, id: string, props: MijnServicesStageProps) {
    super(scope, id, props);
    Aspects.of(this).add(new PermissionsBoundaryAspect());

    /**
     * Creates the database instance (only one currenlty)
     * and create the databases.
     */
    const databasestack = new DatabaseStack(this, 'database-stack', {
      env: props.configuration.deploymentEnvironment,
      configuration: props.configuration,
    });

    /**
     * Main stack of this project
     * Constains resources such as loadbalancer, cloudfront, apigateway, fargate cluster
     */
    const mainstack = new MainStack(this, 'stack', { // Translates to mijn-services-stack
      env: props.configuration.deploymentEnvironment,
      configuration: props.configuration,
    });
    mainstack.addDependency(databasestack, 'Services in main stack need the DB to be created');

  }

}