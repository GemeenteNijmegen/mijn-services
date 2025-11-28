import { PermissionsBoundaryAspect } from '@gemeentenijmegen/aws-constructs';
import { Aspects, Stack, Stage, StageProps, Tags } from 'aws-cdk-lib';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { Configurable } from './ConfigurationInterfaces';
import { Statics } from './Statics';

export interface ParameterStageProps extends StageProps, Configurable { }

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
    this.addHaalCentraalBrpParameters();
    this.addObjecttypesParameters();
    this.addObjectsParameters();
    // GZAC
    this.addKeyCloakParameters();
    this.addGZACBackendParameters();
    // this.addGZACFrontendParameters();
    this.addOpenProductParameters();
    this.addCorsaZgwParameters();

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

  private addCorsaZgwParameters() {
    new Secret(this, 'corsa-zgw-credentials', {
      description: 'Credentials for the corsa zgw admin user (not in use)',
      generateSecretString: {
        excludePunctuation: true,
        secretStringTemplate: JSON.stringify({
          email: 'devops@nijmegen.nl',
        }),
        generateStringKey: 'password',
      },
      secretName: Statics._ssmCorsaZgwCredentials,
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

  private addObjecttypesParameters() {
    new Secret(this, 'objecttypes-credentials', {
      description: 'Credentials for the objecttypes superuser',
      generateSecretString: {
        excludePunctuation: true,
        secretStringTemplate: JSON.stringify({
          username: 'objecttypes',
          email: 'devops@nijmegen.nl',
        }),
        generateStringKey: 'password',
      },
      secretName: Statics._ssmObjecttypesCredentials,
    });
  }

  private addObjectsParameters() {
    new Secret(this, 'objects-credentials', {
      description: 'Credentials for the objects superuser',
      generateSecretString: {
        excludePunctuation: true,
        secretStringTemplate: JSON.stringify({
          username: 'objects',
          email: 'devops@nijmegen.nl',
        }),
        generateStringKey: 'password',
      },
      secretName: Statics._ssmObjectsCredentials,
    });
  }


  /**
   * GZAC Params
   */

  private addKeyCloakParameters() {

    new Secret(this, 'gzac-keycloak-admin-credentials', {
      description: 'Credentials for GZAC KeyCloak Admin user',
      secretName: Statics._ssmGZACKeyCloakAdminCredentials,
      generateSecretString: {
        excludePunctuation: true,
        secretStringTemplate: JSON.stringify({
          username: 'keycloakAdmin',
        }),
        generateStringKey: 'secret',
      },
    });
  }
  private addGZACBackendParameters() {
    new Secret(this, 'gzac-backend-m2m-credentials', {
      description: 'Credentials for GZAC Backend M-2-M',
      secretName: Statics._ssmGZACBackendM2MCredentials,
      generateSecretString: {
        excludePunctuation: true,
        secretStringTemplate: JSON.stringify({
          username: 'valtimo-user-m2m-client',
        }),
        generateStringKey: 'secret',
      },
    });
  };
  // private addGZACFrontendParameters(){};
  private addOpenProductParameters() {
    new Secret(this, 'open-product-credentials', {
      description: 'Credentials for the open product superuser',
      generateSecretString: {
        excludePunctuation: true,
        secretStringTemplate: JSON.stringify({
          username: 'open-product',
          email: 'devops@nijmegen.nl',
        }),
        generateStringKey: 'password',
      },
      secretName: Statics._ssmOpenProductCredentials,
    });
  }
}
