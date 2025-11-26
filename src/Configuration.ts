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
      image: 'maykinmedia/open-product:1.3.0',
      logLevel: 'DEBUG',
      debug: true,
    },
    corsaZgwService: {
      logLevel: 'DEBUG',
      debug: true,
      imageTag: 'ed98f3085aa4bf471c619454f6e409163dca6fd7',
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
    openKlantRegistrationServices: [
      {
        cdkId: 'open-klant-registration-service-test',
        debug: true,
        openKlantUrl:
          'https://mijn-services.dev.nijmegen.nl/open-klant/klantinteracties/api/v1',
        zakenApiUrl:
          'https://mijn-services.dev.nijmegen.nl/open-zaak/zaken/api/v1',
        path: '/open-klant-registration-service-test/callback',
        roltypesToRegister: ['initiator'],
        strategy: 'partijperrol-with-form', // Unique partij per rol (of zaak dus)
        enabled: true,
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
      {
        cdkId: 'woweb-omc',
        path: 'woweb-omc', // Without /
        image: 'worthnl/notifynl-omc:1.15.8',
        debug: true,
        mode: 'Development',
        openKlantUrl: 'mijn-services.accp.nijmegen.nl/open-klant/klantinteracties/api/v1',
        zakenApiUrl: 'openzaak.woweb.app/zaken/api/v1',
        notificatiesApiUrl: 'mijn-services.accp.nijmegen.nl/open-notificaties/api/v1',
        objectenApiUrl: 'mijn-services.accp.nijmegen.nl/objects/api/v2',
        objecttypenApiUrl: 'mijn-services.accp.nijmegen.nl/objecttypes/api/v2',
        zgwTokenInformation: {
          audience: '', // This must be empty for the token to start working... no clue as to why.
          issuer: 'nijmegen_devops',
          userId: 'nijmegen_devops',
          username: 'nijmegen_devops',
        },
        taakObjecttypeUuid: 'fa36dfdd-899c-4b40-92ad-6d5c0077748a',
        templates: {
          // zaakCreateEmail: 'e2915eea-de25-48f5-8292-879d369060fa',
          // zaakUpdateEmail: 'e868044f-4a30-42c9-b1bf-8ad95ec2a6b8',
          // zaakCloseEmail: '14cebdee-a179-4e0e-b7de-c660fdd47c57',
          taskAssignedEmail: 'ec835216-4629-4bba-ac3a-6bc4770062e8',
          // zaakCreateSms: 'b17f8f7a-6992-466d-8248-3f1c077610ce',
          // zaakUpdateSms: '0ff5f21a-2af1-4fd4-8080-45cff34e0df7',
          // zaakCloseSms: 'ac885f24-09d8-4702-845f-2f53cd045790',
          taskAssignedSms: '2ab3d68e-0a8a-4a9a-b091-0e934ed1c64b',
        },
      },
    ],
    openKlantRegistrationServices: [
      {
        cdkId: 'open-klant-registration-service-test',
        debug: true,
        openKlantUrl:
          'https://mijn-services.accp.nijmegen.nl/open-klant/klantinteracties/api/v1',
        zakenApiUrl:
          'https://mijn-services.accp.nijmegen.nl/open-zaak/zaken/api/v1',
        path: '/open-klant-registration-service-test/callback',
        roltypesToRegister: ['initiator'],
        strategy: 'partijperrol-with-form', // Unique partij per rol (of zaak dus)
        enabled: true,
      },
      {
        cdkId: 'open-klant-registration-service-woweb',
        debug: true,
        openKlantUrl: 'https://mijn-services.accp.nijmegen.nl/open-klant/klantinteracties/api/v1',
        zakenApiUrl: 'https://openzaak.woweb.app/zaken/api/v1',
        path: '/open-klant-registration-service-woweb/callback',
        roltypesToRegister: ['initiator'],
        strategy: 'partijperrol-with-form', // Unique partij per rol (of zaak dus)
        enabled: true,
        catalogiWhitelist: [
          '84f9e30d-8a3e-4ca0-8011-556ae3cbdd41', // VIP catalogus on acceptance
        ],
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
    openKlantRegistrationServices: [
      {
        cdkId: 'open-klant-registration-service-woweb',
        debug: false,
        openKlantUrl: 'https://mijn-services.nijmegen.nl/open-klant/klantinteracties/api/v1',
        zakenApiUrl: 'https://openzaak.nijmegen.cloud/zaken/api/v1',
        path: '/open-klant-registration-service-woweb/callback',
        roltypesToRegister: ['initiator'],
        strategy: 'partijperrol-with-form', // Unique partij per rol (of zaak dus)
        enabled: true,
        catalogiWhitelist: [
          '84f9e30d-8a3e-4ca0-8011-556ae3cbdd41', // VIP catalogus op productie
        ],
      },
    ],
    outputManagementComponents: [
      {
        cdkId: 'woweb-omc',
        path: 'woweb-omc', // Without /
        image: 'worthnl/notifynl-omc:1.15.8',
        debug: true,
        mode: 'Production',
        openKlantUrl: 'mijn-services.nijmegen.nl/open-klant/klantinteracties/api/v1',
        zakenApiUrl: 'openzaak.nijmegen.cloud/zaken/api/v1',
        notificatiesApiUrl: 'mijn-services.nijmegen.nl/open-notificaties/api/v1',
        objectenApiUrl: 'mijn-services.nijmegen.nl/objects/api/v2',
        objecttypenApiUrl: 'mijn-services.nijmegen.nl/objecttypes/api/v2',
        zgwTokenInformation: {
          audience: '', // This must be empty for the token to start working... no clue as to why.
          issuer: 'nijmegen_devops',
          userId: 'nijmegen_devops',
          username: 'nijmegen_devops',
        },
        taakObjecttypeUuid: 'fa36dfdd-899c-4b40-92ad-6d5c0077748a', // Let op: gelijk getrokken met acceptatie
        templates: {
          // IDs refer to templates in NotifyNL service: APV - Gemeente Nijmegen
          // zaakCreateEmail: '06ff0f61-a0a3-4ea5-a583-4106dac20c33',
          // zaakUpdateEmail: 'ff09a540-3a88-4f70-9717-11a6c0fac356',
          // zaakCloseEmail: '9582f057-acf4-4fe1-b856-0bfdb6e7e956',
          taskAssignedEmail: 'b9624682-0ecd-48bc-b5f8-884bcc0ac469',
          // zaakCreateSms: 'b789f105-f49b-4a4c-b54d-804db68c3760',
          // zaakUpdateSms: 'ceaa93e9-8ebd-474b-8617-ea41239f1ccb',
          // zaakCloseSms: 'd7ab0077-44f0-4756-ba99-edf5f2ac3ed7',
          taskAssignedSms: '1ef3a3b6-d525-4e57-a212-81448b91ada9',
        },
      },
    ],
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
