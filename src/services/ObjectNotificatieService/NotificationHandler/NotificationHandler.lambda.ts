import { IdempotencyConfig, makeIdempotent } from '@aws-lambda-powertools/idempotency';
import { DynamoDBPersistenceLayer } from '@aws-lambda-powertools/idempotency/dynamodb';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { EventBridgeEvent } from 'aws-lambda';
import { logger } from './Logger';

// ENABLE X-RAY TRACING
const tracer = new Tracer({
  serviceName: 'Receiver-service',
  captureHTTPsRequests: true,
});
tracer.annotateColdStart();
tracer.addServiceNameAnnotation();

const persistenceStore = new DynamoDBPersistenceLayer({
  tableName: process.env.IDEMPOTENCY_TABLE_NAME!,
  keyAttr: 'hash'
});

// First check for locks on the execution (default one hour)
export const handler = makeIdempotent(async (event: EventBridgeEvent<'Scheduled Event', {}>) => {
  logger.debug('Incoming event', JSON.stringify(event));
  try {
    // Get config based on the key.
    return {};
  } catch (error) {
    logger.error('Error during processing of event', error as Error);
    tracer?.addErrorAsMetadata(error as Error);
    throw error;
  }
}, {
  persistenceStore,
  config: new IdempotencyConfig({
    eventKeyJmesPath: 'configKey',
  })
},
);
