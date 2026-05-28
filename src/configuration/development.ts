import { Criticality } from '@gemeentenijmegen/aws-constructs';
import { Duration } from 'aws-cdk-lib';
import { ScheduleExpression } from 'aws-cdk-lib/aws-scheduler';
import { Configuration } from '../ConfigurationInterfaces';
import { Statics } from '../Statics';

export const development: Configuration = {
  branch: 'development',
  buildEnvironment: Statics.gnBuildEnvironment,
  deploymentEnvironment: Statics.gnMijnServicesDev,
  useDockerhubCredentials: true,
  criticality: new Criticality('low'),
  cnameRecords: {
    _b528d6157c2d9a369bf7d7812881d466:
      '_189b6977b0d0141d6cbb01e0ba1386e6.djqtsrsxkq.acm-validations.aws.',
  },
  createTransferServer: false,
  databases: Statics.databasesAcceptance,
  databaseSnapshotRetentionDays: 0,
  openklant: {
    image: 'maykinmedia/open-klant:2.15.0',
    logLevel: 'DEBUG',
    debug: true,
    taskSize: {
      cpu: '512',
      memory: '1024',
    },
  },
  openNotificaties: {
    image: 'openzaak/open-notificaties:1.16.0',
    rabbitMqImage: 'rabbitmq:4.0.5-alpine',
    logLevel: 'DEBUG',
    debug: true,
    persitNotifications: true,
    useNewDatabase: true,
    taskSize: {
      cpu: '512',
      memory: '1024',
    },
  },
  openZaak: {
    image: 'openzaak/open-zaak:1.28.0',
    logLevel: 'DEBUG',
    debug: true,
    apiVersion: '1.3.1',
    celeryTaskSize: {
      cpu: '512',
      memory: '1024',
    },
    taskSize: {
      cpu: '512',
      memory: '1024',
    },
    useNewDatabase: true,
  },
  openZaakServices: [{
    image: 'openzaak/open-zaak:1.28.1',
    logLevel: 'DEBUG',
    debug: true,
    apiVersion: '1.3.1',
    celeryTaskSize: {
      cpu: '512',
      memory: '1024',
    },
    taskSize: {
      cpu: '512',
      memory: '1024',
    },
    databaseName: 'sociaal-domein-open-zaak',
    id: 'sociaal-domein-open-zaak',
    subdomain: 'sociaal-domein-open-zaak',
  }],
  objecttypesService: {
    image: 'maykinmedia/objecttypes-api:3.4.2',
    logLevel: 'DEBUG',
    debug: true,
    useNewDatabase: true,
  },
  objectsService: {
    image: 'maykinmedia/open-object:4.0.0',
    logLevel: 'DEBUG',
    debug: true,
    useNewDatabase: true,
    environment: {
      SITE_DOMAIN: 'https://mijn-services-dev.csp-nijmegen.nl/objects',
    },
    taskSize: {
      cpu: '512',
      memory: '1024',
    },
  },
  openProductServices: {
    image: 'maykinmedia/open-product:1.5.0',
    logLevel: 'DEBUG',
    debug: true,
    celeryTaskSize: {
      memory: '1024',
      cpu: '512',
    },
  },
  corsaZgwService: {
    logLevel: 'DEBUG',
    debug: true,
    imageTag: 'af7cb9eda590f975323ef6b7479d08758ca46cf1',
  },
  vtbServices: [
    {
      cdkId: 'vtb-dev',
      image: 'maykinmedia/open-vtb:latest',
      subdomain: 'vtb-dev',
      databaseName: 'vtb-dev',
      logLevel: 'DEBUG',
      debug: true,
      taskSize: {
        cpu: '512',
        memory: '1024',
      },
    },
  ],
  outputManagementComponents: [
    {
      cdkId: 'local-omc',
      path: 'local-omc', // Without /
      image: 'worthnl/notifynl-omc:1.18.0-dev141',
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
      usePostguardFlag: true,
    },
  ],
  helloWorlService: true,
  ObjectNotificationServices: [
    {
      configKey: 'esfTaak',
      scheduleExpression: ScheduleExpression.rate(Duration.days(1)),
    },
  ],
  keyCloackServices: [
    {
      databaseName: 'mijn-services-keycloak',
      id: 'mijn-services-keycloak',
      image: 'quay.io/keycloak/keycloak:24.0.1',
      logLevel: 'DEBUG',
      subdomain: 'keycloak',
      debug: true,
      loadbalancerPriority: 50,
    },
  ],
};