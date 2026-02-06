import { Criticality } from '@gemeentenijmegen/aws-constructs';
import { Configuration } from './ConfigurationInterfaces';
import { Statics } from './Statics';

const EnvironmentConfigurations: { [key: string]: Configuration } = {
  development: {
    branch: 'development',
    buildEnvironment: Statics.gnBuildEnvironment,
    deploymentEnvironment: Statics.gnMijnServicesDev,
    criticality: new Criticality('low'),
    cnameRecords: {
      _b528d6157c2d9a369bf7d7812881d466:
        '_189b6977b0d0141d6cbb01e0ba1386e6.djqtsrsxkq.acm-validations.aws.',
    },
    createTransferServer: false,
    databases: Statics.databasesAcceptance,
    databaseSnapshotRetentionDays: 0,
    openklant: {
      image: 'maykinmedia/open-klant:2.5.0',
      logLevel: 'DEBUG',
      debug: true,
    },
    openNotificaties: {
      image: 'openzaak/open-notificaties:1.8.0',
      rabbitMqImage: 'rabbitmq:4.0.5-alpine',
      logLevel: 'DEBUG',
      debug: true,
      persitNotifications: true,
    },
    openZaak: {
      image: 'openzaak/open-zaak:1.17.0',
      logLevel: 'DEBUG',
      debug: true,
      apiVersion: '1.3.1',
    },
    objecttypesService: {
      image: 'maykinmedia/objecttypes-api:3.0.0',
      logLevel: 'DEBUG',
      debug: true,
    },
    objectsService: {
      image: 'maykinmedia/objects-api:3.0.0',
      logLevel: 'DEBUG',
      debug: true,
    },
    // keyCloackService: {
    //   image: 'quay.io/keycloak/keycloak:24.0.1',
    //   logLevel: 'DEBUG',
    //   debug: true,
    // },
    // gzacService: {
    //   backendImage: 'ritense/gzac-backend:12.6.0',
    //   frontendImage: 'ritense/gzac-frontend:12.6.0',
    //   logLevel: 'DEBUG',
    //   debug: true,
    // },
    // gzacFrontendService: {
    //   image: 'ritense/gzac-frontend:12.6.0',
    //   logLevel: 'DEBUG',
    //   debug: true,
    // },
    openProductServices: {
      image: 'maykinmedia/open-product:1.5.0',
      logLevel: 'DEBUG',
      debug: true,
    },
    corsaZgwService: {
      logLevel: 'DEBUG',
      debug: true,
      imageTag: 'a4214406aca84181bd4d6998abd9a8b8c770da22',
    },
    outputManagementComponents: [
      {
        cdkId: 'local-omc',
        path: 'local-omc', // Without /
        image: 'worthnl/notifynl-omc:1.15.8',
        debug: true,
        mode: 'Development',
        openKlantUrl: 'mijn-services.dev.nijmegen.nl/open-klant/klantinteracties/api/v1',
        zakenApiUrl: 'mijn-services.dev.nijmegen.nl/open-zaak/zaken/api/v1',
        notificatiesApiUrl: 'mijn-services.dev.nijmegen.nl/open-notificaties/api/v1',
        zgwTokenInformation: {
          audience: '', // This must be empty for the token to start working... no clue as to why.
          issuer: 'OMC',
          userId: 'OMC',
          username: 'OMC',
        },
        templates: {
          zaakCreateEmail: 'e2915eea-de25-48f5-8292-879d369060fa',
          zaakUpdateEmail: 'e868044f-4a30-42c9-b1bf-8ad95ec2a6b8',
          zaakCloseEmail: '14cebdee-a179-4e0e-b7de-c660fdd47c57',
          zaakCreateSms: 'b17f8f7a-6992-466d-8248-3f1c077610ce',
          zaakUpdateSms: '0ff5f21a-2af1-4fd4-8080-45cff34e0df7',
          zaakCloseSms: 'ac885f24-09d8-4702-845f-2f53cd045790',
          taskAssignedEmail: 'e2915eea-de25-48f5-8292-879d369060fa',
          taskAssignedSms: 'b17f8f7a-6992-466d-8248-3f1c077610ce',
        },
      },
    ],
    helloWorlService: true,
  },
  acceptance: {
    branch: 'acceptance',
    buildEnvironment: Statics.gnBuildEnvironment,
    deploymentEnvironment: Statics.gnMijnServicesAccp,
    criticality: new Criticality('medium'),
    alternativeDomainNames: ['mijn-services.accp.nijmegen.nl'],
    cnameRecords: {
      '_b528d6157c2d9a369bf7d7812881d466': '_189b6977b0d0141d6cbb01e0ba1386e6.djqtsrsxkq.acm-validations.aws.', // mijn-services-accp.csp-nijmegen.nl
      '_22e7332b63fd18e078cd3715738d18d9.cf': '_e5d28e1bd0ff65a32fd6ff0c794963a5.xlfgrmvvlj.acm-validations.aws.', //cf.mijn-services-accp.csp-nijmegen.nl
    },
    createTransferServer: false,
    databases: Statics.databasesAcceptance,
    databaseSnapshotRetentionDays: 10,
    openklant: {
      image: 'maykinmedia/open-klant:2.5.0',
      logLevel: 'DEBUG',
      debug: true,
    },
    openNotificaties: {
      image: 'openzaak/open-notificaties:1.8.0',
      rabbitMqImage: 'rabbitmq:4.0.5-alpine',
      logLevel: 'DEBUG',
      debug: true,
      persitNotifications: true,
    },
    openZaak: {
      image: 'openzaak/open-zaak:1.17.0',
      logLevel: 'DEBUG',
      debug: true,
      apiVersion: '1.3.1',
    },
    objecttypesService: {
      image: 'maykinmedia/objecttypes-api:3.0.0',
      logLevel: 'DEBUG',
      debug: true,
    },
    objectsService: {
      image: 'maykinmedia/objects-api:3.0.0',
      logLevel: 'DEBUG',
      debug: true,
      taskSize: {
        cpu: '1024', // 1vCPU
        memory: '2048', // 2GB
      },
    },
    keyCloackService: {
      image: 'quay.io/keycloak/keycloak:24.0.1',
      logLevel: 'DEBUG',
      debug: true,
    },
    gzacService: {
      backendImage: 'ritense/gzac-backend:12.6.0',
      frontendImage: 'ritense/gzac-frontend:12.6.0',
      logLevel: 'DEBUG',
      debug: true,
    },
    gzacFrontendService: {
      image: 'ritense/gzac-frontend:12.6.0',
      logLevel: 'DEBUG',
      debug: true,
    },
    openProductServices: {
      image: 'maykinmedia/open-product:1.2.0',
      logLevel: 'DEBUG',
      debug: true,
    },
    outputManagementComponents: [
      {
        cdkId: 'local-omc',
        path: 'local-omc', // Without /
        image: 'worthnl/notifynl-omc:1.15.8',
        debug: true,
        mode: 'Development',
        openKlantUrl: 'mijn-services.accp.nijmegen.nl/open-klant/klantinteracties/api/v1',
        zakenApiUrl: 'mijn-services.accp.nijmegen.nl/open-zaak/zaken/api/v1',
        notificatiesApiUrl: 'mijn-services.accp.nijmegen.nl/open-notificaties/api/v1',
        zgwTokenInformation: {
          audience: '', // This must be empty for the token to start working... no clue as to why.
          issuer: 'OMC',
          userId: 'OMC',
          username: 'OMC',
        },
        templates: {
          zaakCreateEmail: 'e2915eea-de25-48f5-8292-879d369060fa',
          zaakUpdateEmail: 'e868044f-4a30-42c9-b1bf-8ad95ec2a6b8',
          zaakCloseEmail: '14cebdee-a179-4e0e-b7de-c660fdd47c57',
          zaakCreateSms: 'b17f8f7a-6992-466d-8248-3f1c077610ce',
          zaakUpdateSms: '0ff5f21a-2af1-4fd4-8080-45cff34e0df7',
          zaakCloseSms: 'ac885f24-09d8-4702-845f-2f53cd045790',
          taskAssignedEmail: 'e2915eea-de25-48f5-8292-879d369060fa',
          taskAssignedSms: 'b17f8f7a-6992-466d-8248-3f1c077610ce',
        },
      },
    ],
  },
  main: {
    branch: 'main',
    buildEnvironment: Statics.gnBuildEnvironment,
    deploymentEnvironment: Statics.gnMijnServicesProd,
    criticality: new Criticality('high'),
    alternativeDomainNames: ['mijn-services.nijmegen.nl'],
    cnameRecords: {
      '_762e893c9ea81e57b34ab11ed543256d': '_1c518863d978cddd100e65875b7c1136.djqtsrsxkq.acm-validations.aws.',
      '_b1b085f6b7bb12e30a7deaa16d9137e9.cf': '_8ea358006b327389c8e5c4e02e60bbfd.xlfgrmvvlj.acm-validations.aws.',
    },
    databases: Statics.databasesProduction,
    databaseSnapshotRetentionDays: 35,
    openklant: {
      image: 'maykinmedia/open-klant:2.5.0',
      logLevel: 'INFO',
    },
    // outputManagementComponents: [
    // ],
    openNotificaties: {
      image: 'openzaak/open-notificaties:1.8.0',
      rabbitMqImage: 'rabbitmq:4.0.5-alpine',
      logLevel: 'INFO',
      debug: false,
      persitNotifications: true,
    },
    openZaak: {
      image: 'openzaak/open-zaak:1.17.0',
      logLevel: 'INFO',
      debug: false,
      apiVersion: '1.3.1',
      taskSize: {
        cpu: '512',
        memory: '2048',
      },
      celeryTaskSize: {
        cpu: '512',
        memory: '2048',
      },
    },
    objecttypesService: {
      image: 'maykinmedia/objecttypes-api:3.0.0',
      logLevel: 'INFO',
      debug: false,
    },
    objectsService: {
      image: 'maykinmedia/objects-api:3.0.0',
      logLevel: 'INFO',
      debug: false,
      taskSize: {
        cpu: '512',
        memory: '1024',
      },
    },
  },
};

/**
 * Retrieve a configuration object by passing a branch string
 *
 * **NB**: This retrieves the subobject with key `branchName`, not
 * the subobject containing the `branchName` as the value of the `branch` key
 *
 * @param branchName the branch for which to retrieve the environment
 * @returns the configuration object for this branch
 */
export function getEnvironmentConfiguration(branchName: string): Configuration {
  const conf = EnvironmentConfigurations[branchName];
  if (!conf) {
    throw Error(`No configuration found for branch ${branchName}`);
  }
  return conf;
}
