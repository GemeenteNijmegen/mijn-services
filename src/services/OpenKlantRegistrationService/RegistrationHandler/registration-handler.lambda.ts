import { BatchProcessor, EventType, processPartialResponse } from '@aws-lambda-powertools/batch';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { captureLambdaHandler } from '@aws-lambda-powertools/tracer/middleware';
import { AWS, environmentVariables } from '@gemeentenijmegen/utils';
import middy from '@middy/core';
import { SQSEvent, SQSHandler, SQSRecord } from 'aws-lambda';
import type { Subsegment } from 'aws-xray-sdk-core';
import { CatalogiApi } from './CatalogiApi';
import { OpenKlantApi } from './OpenKlantApi';
import { OpenKlantRegistrationHandler, OpenKlantRegistrationServiceProps } from './OpenKlantRegistrationHandler';
import { ZakenApi } from './ZakenApi';
import { logger } from '../Shared/Logger';
import { NotificationSchema } from '../Shared/model/Notification';

const processor = new BatchProcessor(EventType.SQS);
const tracer = new Tracer({
  serviceName: `${process.env.SERVICE_NAME}-receiver`,
  captureHTTPsRequests: true,
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


// ENABLE X-RAY TRACING
const segment = tracer?.getSegment(); // This is the facade segment (the one that is created by AWS Lambda)
if (!segment) {
  logger.debug('no xray tracing segment found', { tracer });
}
let subsegment: Subsegment | undefined;
if (tracer && segment) {
  // Create subsegment for the function & set it as active
  subsegment = segment.addNewSubsegment('registration-handler');
  tracer.setSegment(subsegment);
}
tracer?.annotateColdStart();
tracer?.addServiceNameAnnotation();

export async function recordHandler(record: SQSRecord, configuration: OpenKlantRegistrationServiceProps) {
  logger.debug('Handling record', { record });

  try {
    const notification = NotificationSchema.parse(JSON.parse(record.body));
    const registrationHandler = new OpenKlantRegistrationHandler(configuration);
    await registrationHandler.handleNotification(notification);
  } catch (error) {
    logger.error('Error during processing of record', error as Error);
    tracer?.addErrorAsMetadata(error as Error);
    throw Error('Failed to handle SQS message');
  }

}

export const handler: SQSHandler = middy(async (event: SQSEvent) => {
  const configuration = await initalize();
  const configuredRecordHandler = (record: SQSRecord) => recordHandler(record, configuration);
  await processPartialResponse(event, configuredRecordHandler, processor);
}).use(captureLambdaHandler(tracer));


