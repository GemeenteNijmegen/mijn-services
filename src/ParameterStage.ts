import { PermissionsBoundaryAspect } from '@gemeentenijmegen/aws-constructs';
import { Stack, Tags, Stage, StageProps, Aspects } from 'aws-cdk-lib';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
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
    this.addOpenZaakParameters();
    this.addOutputManagementComponentParameters();
    this.addHaalCentraalBrpParameters();

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

  private addOpenZaakParameters() {
    new Secret(this, 'open-zaak-credentials', {
      description: 'Credentials for the open zaak superuser',
      generateSecretString: {
        excludePunctuation: true,
        secretStringTemplate: JSON.stringify({
          username: 'open-zaak',
          email: 'devops@nijmegen.nl',
        }),
        generateStringKey: 'password',
      },
      secretName: Statics._ssmOpenZaakCredentials,
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
      secretName: Statics._ssmRabbitMqCredentials,
    });

    new Secret(this, 'client-credentials-1', {
      description: 'Credentials for openzaak to access opennotifications',
      secretName: Statics._ssmClientCredentialsZaakNotifications,
      generateSecretString: {
        excludePunctuation: true,
        secretStringTemplate: JSON.stringify({
          username: 'zaak-to-notifications',
        }),
        generateStringKey: 'secret',
      },
    });

    new Secret(this, 'client-credentials-2', {
      description: 'Credentials for opennotifications to access openzaak',
      secretName: Statics._ssmClientCredentialsNotificationsZaak,
      generateSecretString: {
        excludePunctuation: true,
        secretStringTemplate: JSON.stringify({
          username: 'notifications-to-zaak',
        }),
        generateStringKey: 'secret',
      },
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

  private addOutputManagementComponentParameters() {
    new Secret(this, 'omc-jwt', {
      description: 'Signing secret for ZGW token used to authenticate at OMC',
      generateSecretString: {
        excludePunctuation: true,
      },
      secretName: Statics._ssmOmcOmcJwtSecret,
    });

    new Secret(this, 'zgw-jwt', {
      description: 'Signing secret for ZGW token used by OMC',
      generateSecretString: {
        excludePunctuation: true,
      },
      secretName: Statics._ssmOmcZgwJwtSecret,
    });
  }

  private addHaalCentraalBrpParameters() {
    new StringParameter(this, 'haalcentraal-brp-baseurl', {
      stringValue: 'https://api.haal-centraal-brp-accp.csp-nijmegen.nl',
      parameterName: Statics.ssmHaalCentraalBRPBaseUrl,
    });

    new Secret(this, 'haalcentraal-brp-key', {
      description: 'API key for Haal Centraal API',
      secretName: Statics.ssmHaalCentraalBRPApiKeySecret,
    });
  }


}
