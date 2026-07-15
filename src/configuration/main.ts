import { Criticality } from '@gemeentenijmegen/aws-constructs';
import { Duration } from 'aws-cdk-lib';
import { ScheduleExpression } from 'aws-cdk-lib/aws-scheduler';
import { Configuration } from '../ConfigurationInterfaces';
import { Statics } from '../Statics';

export const main: Configuration = {
  branch: 'main',
  buildEnvironment: Statics.gnBuildEnvironment,
  deploymentEnvironment: Statics.gnMijnServicesProd,
  useDockerhubCredentials: true,
  criticality: new Criticality('high'),
  alternativeDomainNames: ['mijn-services.nijmegen.nl'],
  cnameRecords: {
    '_762e893c9ea81e57b34ab11ed543256d': '_1c518863d978cddd100e65875b7c1136.djqtsrsxkq.acm-validations.aws.',
    '_b1b085f6b7bb12e30a7deaa16d9137e9.cf': '_8ea358006b327389c8e5c4e02e60bbfd.xlfgrmvvlj.acm-validations.aws.',
  },
  databases: Statics.databasesProduction,
  databaseSnapshotRetentionDays: 35,
  openklant: {
    image: 'maykinmedia/open-klant:2.15.0',
    logLevel: 'INFO',
  },
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
    image: 'maykinmedia/objects-api:3.6.1',
    migrationImage: 'maykinmedia/objects-api:3.6.1',
    logLevel: 'INFO',
    debug: false,
    useNewDatabase: true,
    taskSize: {
      cpu: '512',
      memory: '1024',
      desiredTaskCount: 1,
    },
    celeryTaskSize: {
      cpu: '256',
      memory: '512',
      desiredTaskCount: 1,
    },
  },
  ObjectNotificationServices: [
    {
      configKey: 'esfTaak',
      scheduleExpression: ScheduleExpression.rate(Duration.days(1)),
    },
  ],
};
