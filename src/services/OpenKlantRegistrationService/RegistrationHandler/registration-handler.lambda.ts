import { makeIdempotent } from '@aws-lambda-powertools/idempotency';
import { DynamoDBPersistenceLayer } from '@aws-lambda-powertools/idempotency/dynamodb';
import { AWS, environmentVariables } from '@gemeentenijmegen/utils';
import { SQSEvent } from 'aws-lambda';
import { CatalogiApi } from './CatalogiApi';
import { OpenKlantApi } from './OpenKlantApi';
import { OpenKlantRegistrationHandler, OpenKlantRegistrationServiceProps } from './OpenKlantRegistrationHandler';
import { ZakenApi } from './ZakenApi';
import { ErrorResponse } from '../Shared/ErrorResponse';
import { logger } from '../Shared/Logger';
import { Notification, NotificationSchema } from '../Shared/model/Notification';

const persistenceStore = new DynamoDBPersistenceLayer({
  tableName: process.env.IDEMPOTENCY_TABLE_NAME ?? '',
});


async function initalize(): Promise<OpenKlantRegistrationServiceProps> {
  const env = environmentVariables([
    'OPEN_KLANT_API_URL',
    'OPEN_KLANT_API_KEY_ARN',
    'ZAKEN_API_URL',
    'ZGW_TOKEN_CLIENT_ID_ARN',
    'ZGW_TOKEN_CLIENT_SECRET_ARN',
    'ROLTYPES_TO_REGISTER',
  ]);

  const [openKlantApiKey, zgwClientId, zgwClientSecret] = await Promise.all([
    AWS.getSecret(env.OPEN_KLANT_API_KEY_ARN),
    AWS.getSecret(env.ZGW_TOKEN_CLIENT_ID_ARN),
    AWS.getSecret(env.ZGW_TOKEN_CLIENT_SECRET_ARN),
  ]);

  return {
    zakenApiUrl: env.ZAKEN_API_URL,
    zakenApi: new ZakenApi({
      clientId: zgwClientId,
      clientSecret: zgwClientSecret,
      zakenApiUrl: env.ZAKEN_API_URL,
    }),
    openKlantApi: new OpenKlantApi({
      apikey: openKlantApiKey,
      url: env.OPEN_KLANT_API_URL,
    }),
    catalogiApi: new CatalogiApi({
      clientId: zgwClientId,
      clientSecret: zgwClientSecret,
    }),
    roltypesToRegister: env.ROLTYPES_TO_REGISTER.split(','),
    catalogusUuids: process.env.CATALOGI_WHITELIST ? process.env.CATALOGI_WHITELIST.split(',') : undefined,
  };

}

let configuration: undefined | OpenKlantRegistrationServiceProps = undefined;

export const handler = makeIdempotent(
  async (event: SQSEvent) => { return handle(event); },
  { persistenceStore },
);

async function handle(event: SQSEvent) {

  logger.debug('Incomming event', JSON.stringify(event));

  if (!configuration) {
    configuration = await initalize();
  }

  try {
    // Create the handler
    const registrationHandler = new OpenKlantRegistrationHandler(configuration);

    // Handle the notification event
    const notifications = parseNotificationFromBody(event);
    for (const notification of notifications) {
      await registrationHandler.handleNotification(notification);
    }

  } catch (error) {
    logger.error('Error during processing of notification', error as Error);
    throw Error('Failed to handle SQS message');
  }

}

function parseNotificationFromBody(event: SQSEvent): Notification[] {
  try {

    if (!event.Records || event.Records.length == 0) {
      throw Error('Empty event received from queue');
    }

    const notifications: Notification[] = [];

    for (const record of event.Records) {
      if (!record.body) {
        throw Error('Received notification without notification body!');
      }
      const notification = NotificationSchema.parse(JSON.parse(record.body));
      notifications.push(notification);
    }

    return notifications;

  } catch (error) {
    logger.error('Could ont parse notification', error as Error);
    throw new ErrorResponse(400, 'Error parsing body');
  }
}
