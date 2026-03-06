import { IdempotencyConfig, makeIdempotent } from '@aws-lambda-powertools/idempotency';
import { DynamoDBPersistenceLayer } from '@aws-lambda-powertools/idempotency/dynamodb';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { Config } from '@gemeentenijmegen/config/config';
import Notifier from '@gemeentenijmegen/object-notifier';
import { logger } from './Logger';

// ENABLE X-RAY TRACING
const tracer = new Tracer({
  serviceName: 'Receiver-service',
  captureHTTPsRequests: true,
});
tracer.annotateColdStart();
tracer.addServiceNameAnnotation();
const config = new Config();

const persistenceStore = new DynamoDBPersistenceLayer({
  tableName: process.env.IDEMPOTENCY_TABLE_NAME!,
  keyAttr: 'hash',
});

// First check for locks on the execution (default one hour)
export const handler = makeIdempotent(async (event: { configKey: string }) => {
  logger.debug('Incoming event', JSON.stringify(event));
  try {
    logger.info('starting execution');
    await handleNotificationsForKey(event.configKey);
    logger.info('completed execution');
  } catch (error) {
    logger.error('Error during processing of event', error as Error);
    tracer?.addErrorAsMetadata(error as Error);
    throw error;
  }
}, {
  persistenceStore,
  config: new IdempotencyConfig({
    eventKeyJmesPath: 'configKey',
  }),
},
);

async function handleNotificationsForKey(key: string) {
  // Get notification config;
  const appConfig = await config.get(key);

  //TODO validation
  const notifier = new Notifier(appConfig);
  await notifier.notify();
}
