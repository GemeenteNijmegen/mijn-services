import { Response } from '@gemeentenijmegen/apigateway-http';
import { environmentVariables } from '@gemeentenijmegen/utils';
import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { OpenKlantRegistrationHandler } from './OpenKlantRegistrationHandler';

const registrationHandler = new OpenKlantRegistrationHandler();
const init = registrationHandler.init();

export async function handler(event: APIGatewayProxyEventV2) {
  if (process.env.DEBUG === 'true') {
    console.log(event);
  }


  environmentVariables([
    'OPEN_KLANT_API_URL',
    'OPEN_KLANT_API_KEY_ARN',
    'ZAKEN_API_URL',
    'ZGW_TOKEN_CLIENT_ID',
    'ZGW_TOKEN_CLIENT_SECRET',
  ]);

  try {

    // TODO custom authentication usign API key?

    await init;
    const json = parseNotificationFromBody(event);
    return await registrationHandler.handleNotification(json);
  } catch (error) {
    console.log(JSON.stringify(error));
    return Response.error(500);
  }
}

function parseNotificationFromBody(event: APIGatewayProxyEventV2) {
  if (!event.body) {
    throw Error('Received notification without notification body!');
  }
  let body = event.body;
  if (event.isBase64Encoded) {
    body = Buffer.from(event.body, 'base64').toString('utf-8');
  }
  return JSON.parse(body);
}