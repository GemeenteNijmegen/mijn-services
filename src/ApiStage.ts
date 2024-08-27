import { PermissionsBoundaryAspect } from '@gemeentenijmegen/aws-constructs';
import { Aspects, Stage, StageProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Configurable } from './Configuration';
import { UsEastStack } from './UsEastStack';

interface ApiStageProps extends StageProps, Configurable {}

export class ApiStage extends Stage {

  constructor(scope: Construct, id: string, props: ApiStageProps) {
    super(scope, id, props);
    Aspects.of(this).add(new PermissionsBoundaryAspect());

    /**
     * Some resources must be in us-east-1 for AWS to be able to attach
     * them to the CloudFront distribution. This will be the case untill the
     * AWS European Sovereign Cloud is available and supports CloudFront.
     * See: https://aws.amazon.com/blogs/security/aws-digital-sovereignty-pledge-announcing-a-new-independent-sovereign-cloud-in-europe/
     */
    new UsEastStack(this, 'us-east', {
      env: {
        account: props.configuration.deploymentEnvironment.account,
        region: 'us-east-1',
      },
      configuration: props.configuration,
    });

  }

}