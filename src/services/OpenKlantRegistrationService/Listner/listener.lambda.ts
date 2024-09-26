import { Response } from '@gemeentenijmegen/apigateway-http';
import { AWS, environmentVariables } from '@gemeentenijmegen/utils';
import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { OpenKlantRegistrationHandler, OpenKlantRegistrationServiceProps } from './OpenKlantRegistrationHandler';


async function initalize() : Promise<OpenKlantRegistrationServiceProps> {
  const env = environmentVariables([
    'OPEN_KLANT_API_URL',
    'OPEN_KLANT_API_KEY_ARN',
    'ZAKEN_API_URL',
    'ZGW_TOKEN_CLIENT_CREDETIALS_ARN',
    'API_KEY',
  ]);

  const openKlantApiKey = await AWS.getSecret(env.OPEN_KLANT_API_KEY_ARN);
  const zgwCredentials = JSON.parse(await AWS.getSecret(env.ZGW_TOKEN_CLIENT_CREDETIALS_ARN));
  API_KEY = await AWS.getSecret(env.API_KEY);

  return {
    openKlantApiUrl: env.OPEN_KLANT_API_URL,
    openKlantApiKey: openKlantApiKey,
    zakenApiUrl: env.ZAKEN_API_URL,
    zgwTokenClientId: zgwCredentials.clientId,
    zgwTokenClientSecret: zgwCredentials.secret,
  };

}
const configuration = initalize();

export async function handler(event: APIGatewayProxyEventV2) {

  // Log the event in debug modes
  if (process.env.DEBUG === 'true') {
    console.log(event);
  }

  try {

    // Check if the caller send the correct API key
    // Note: this must be done in the lambda as the API gateway only offers API KEYs for the whole stage.
    const authenticated = await authenticate(event);
    if (authenticated !== true) {
      return authenticated;
    }

    // Create the handler
    const registrationHandler = new OpenKlantRegistrationHandler(await configuration);

    // Handle the notification event
    const json = parseNotificationFromBody(event);
    return await registrationHandler.handleNotification(json);

  } catch (error) {
    console.log(JSON.stringify(error));
    return Response.error(500);
  }
}


let API_KEY: string | undefined = undefined;
async function authenticate(event: APIGatewayProxyEventV2) {
  if (!API_KEY) {
    const env = environmentVariables(['API_KEY']);
    API_KEY = await AWS.getSecret(env.API_KEY);
  }

  if (!API_KEY) {
    console.error('API_KEY was not loaded, cannot authenticate request');
    return Response.error(401);
  }

  const header = event.headers?.['x-api-key'];
  if (!header) {
    console.error('No x-api-key header fount in the request');
    return Response.error(401, JSON.stringify({ error: 'No x-api-key header fount in the request' }));
  }

  if (header === API_KEY) {
    return true;
  }

  console.error('Invalid API key');
  return Response.error(401, JSON.stringify({ error: 'Invalid API key.' }));

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