import { PermissionsBoundaryAspect } from '@gemeentenijmegen/aws-constructs';
import { Stack, Tags, Stage, StageProps, Aspects } from 'aws-cdk-lib';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';
import { Configurable } from './Configuration';
import { Statics } from './Statics';

export interface ParameterStageProps extends StageProps, Configurable {}

/**
 * Stage for creating SSM parameters. This needs to run
 * before stages that use them.
 */
export class ParameterStage extends Stage {
  constructor(scope: Construct, id: string, props: ParameterStageProps) {
    super(scope, id, props);
    Tags.of(this).add('cdkManaged', 'yes');
    Tags.of(this).add('Project', Statics.projectName);
    Aspects.of(this).add(new PermissionsBoundaryAspect());
    new ParameterStack(this, 'stack');
  }
}

/**
 * Stack that creates ssm parameters for the application.
 * These need to be present before stacks that use them.
 */
export class ParameterStack extends Stack {
  constructor(scope: Construct, id: string) {
    super(scope, id);
    Tags.of(this).add('cdkManaged', 'yes');
    Tags.of(this).add('Project', Statics.projectName);

    this.addOpenKlantParameters();
    this.addDatabaseCredentials();
    this.addOpenNotificatiesParameters();

  }


  private addOpenKlantParameters() {
    new Secret(this, 'open-klant-credentials', {
      description: 'Credentials for the open klant superuser',
      generateSecretString: {
        excludePunctuation: true,
        secretStringTemplate: JSON.stringify({
          username: 'open-klant',
          email: 'devops@nijmegen.nl',
        }),
        generateStringKey: 'password',
      },
      secretName: Statics._ssmOpenKlantCredentials,
    });
  }

  private addOpenNotificatiesParameters() {
    new Secret(this, 'open-notificaties-credentials', {
      description: 'Credentials for the open notificaties superuser',
      generateSecretString: {
        excludePunctuation: true,
        secretStringTemplate: JSON.stringify({
          username: 'open-notificaties',
          email: 'devops@nijmegen.nl',
        }),
        generateStringKey: 'password',
      },
      secretName: Statics._ssmOpenNotificatiesCredentials,
    });

    new Secret(this, 'rabbit-mq-credentials', {
      description: 'Credentials for the open notificaties rabbit mq instance',
      generateSecretString: {
        excludePunctuation: true,
        secretStringTemplate: JSON.stringify({
          username: 'open-notificaties-rabbit-mq',
        }),
        generateStringKey: 'password',
      },
      secretName: Statics._ssmOpenNotificatiesCredentials,
    });
  }


  private addDatabaseCredentials() {
    new Secret(this, 'db-credentials', {
      description: 'Credentials for connecting to the mijn-services database instance',
      generateSecretString: {
        excludePunctuation: true,
        secretStringTemplate: JSON.stringify({
          username: 'mijn_services',
        }),
        generateStringKey: 'password',
      },
      secretName: Statics._ssmDatabaseCredentials,
    });
  }


}
