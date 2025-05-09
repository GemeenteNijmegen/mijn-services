import { Tracer } from '@aws-lambda-powertools/tracer';
import { AWS, environmentVariables } from '@gemeentenijmegen/utils';
import { SQSEvent } from 'aws-lambda';
import type { Subsegment } from 'aws-xray-sdk-core';
import { ErrorResponse } from '../Shared/ErrorResponse';
import { logger } from '../Shared/Logger';
import { Notification, NotificationSchema } from '../Shared/model/Notification';
import { CatalogiApi } from './CatalogiApi';
import { OpenKlantApi } from './OpenKlantApi';
import { OpenKlantRegistrationHandler, OpenKlantRegistrationServiceProps } from './OpenKlantRegistrationHandler';
import { ZakenApi } from './ZakenApi';

const tracer = new Tracer({
  serviceName: `${process.env.SERVICE_NAME}-receiver`, captureHTTPsRequests: true,
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

// const idempotency = new IdempotencyChecker(process.env.IDEMPOTENCY_TABLE_NAME!, new DynamoDBClient());
let configuration: undefined | OpenKlantRegistrationServiceProps = undefined;

export async function handler(event: SQSEvent) {
  logger.debug('Incomming event', JSON.stringify(event));

  // ENABLE X-RAY TRACING
  const segment = tracer?.getSegment(); // This is the facade segment (the one that is created by AWS Lambda)
  if (!segment) {
    logger.debug('no xray tracing segment found', { tracer });
  }
  let subsegment: Subsegment | undefined;
  if (tracer && segment) {
    // Create subsegment for the function & set it as active
    subsegment = segment.addNewSubsegment(`## ${process.env._HANDLER}`);
    tracer.setSegment(subsegment);
  }
  tracer?.annotateColdStart();
  tracer?.addServiceNameAnnotation();


  if (!configuration) {
    configuration = await initalize();
  }

  try {
    // Create the handler
    const registrationHandler = new OpenKlantRegistrationHandler(configuration);

    // Handle the notification event
    const notifications = parseNotificationFromBody(event);
    for (const notification of notifications) {
      // const hashKey = idempotency.calculateHashKey(notifications);
      // if (await idempotency.checkAlreadyHandled(hashKey)) {
      //   logger.info('Already handled event', { hashKey });
      //   continue;
      // }
      await registrationHandler.handleNotification(notification);
      // await idempotency.registerIdempotencyCheck(hashKey);
    }

  } catch (error) {
    logger.error('Error during processing of notification', error as Error);
    tracer?.addErrorAsMetadata(error as Error);
    throw Error('Failed to handle SQS message');
  } finally {
    if (segment && subsegment) {
      // Close subsegment (the AWS Lambda one is closed automatically)
      subsegment.close();
      // Set back the facade segment as active again
      tracer?.setSegment(segment);
    }
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


