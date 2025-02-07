import { createHash } from 'crypto';
import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { Response } from '@gemeentenijmegen/apigateway-http';
import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { authenticate } from '../Shared/authenticate';
import { ErrorResponse } from '../Shared/ErrorResponse';
import { logger } from '../Shared/Logger';
import { Notification, NotificationSchema } from '../Shared/model/Notification';

const sqs = new SQSClient();

export async function handler(event: APIGatewayProxyEventV2) {
  logger.debug('Incomming event', JSON.stringify(event));

  try {

    // Check if the caller send the correct API key
    // Note: this must be done in the lambda as the API gateway only offers API KEYs for the whole stage.
    const authenticated = await authenticate(event);
    if (authenticated !== true) {
      return authenticated;
    }

    // Check if we need to handle this notification event
    const notification = parseNotificationFromBody(event);
    const ignoreReasons = validateNotification(notification);
    if (ignoreReasons) {
      logger.info('Notification ignored', { ignoreReasons });
      return Response.ok();
    }

    // Forward the notification to the queue
    const messageJson = JSON.stringify(notification);
    const deduplicationId = createHash('sha256').update(messageJson).digest('hex');
    await sqs.send(new SendMessageCommand({
      MessageBody: messageJson,
      QueueUrl: process.env.QUEUE_URL,
      MessageDeduplicationId: deduplicationId,
      MessageGroupId: process.env.REGISTRATION_SERVICE_ID,
    }));

    return Response.ok();

  } catch (error) {
    if (error instanceof ErrorResponse) {
      return Response.error(error.statusCode, error.message);
    }
    logger.error('Error during processing of event', error as Error);
    return Response.error(500);
  }
}

function parseNotificationFromBody(event: APIGatewayProxyEventV2): Notification {
  try {
    if (!event.body) {
      throw Error('Received notification without notification body!');
    }
    let body = event.body;
    if (event.isBase64Encoded) {
      body = Buffer.from(event.body, 'base64').toString('utf-8');
    }
    return NotificationSchema.parse(JSON.parse(body));
  } catch (error) {
    logger.error('Could ont parse notification', error as Error);
    throw new ErrorResponse(400, 'Error parsing body');
  }
}

export function validateNotification(notification: Notification): string[] | undefined {
  const errors: string[] = [];

  if (notification.actie !== 'create' || notification.resource !== 'rol') {
    errors.push(`Only rol creation notifications are handled by this endpoint (recevied: ${notification.actie}, ${notification.resource}).`);
  }

  if (!notification.hoofdObject.includes(process.env.ZAKEN_API_URL!)) {
    errors.push('Notification points to a different ZRC than is configured for this endpoint.');
  }

  return errors.length == 0 ? undefined : errors;
}