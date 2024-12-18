import { Response } from '@gemeentenijmegen/apigateway-http';
import { AWS, environmentVariables } from '@gemeentenijmegen/utils';
import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { authenticate } from './authenticate';
import { BRPApi } from './BRPApi';
import { CatalogiApi } from './CatalogiApi';
import { ErrorResponse } from './ErrorResponse';
import { Notification, NotificationSchema } from './model/Notification';
import { OpenKlantApi } from './OpenKlantApi';
import { OpenKlantRegistrationHandler, OpenKlantRegistrationServiceProps } from './OpenKlantRegistrationHandler';
import { ZakenApi } from './ZakenApi';


async function initalize() : Promise<OpenKlantRegistrationServiceProps> {
  const env = environmentVariables([
    'OPEN_KLANT_API_URL',
    'OPEN_KLANT_API_KEY_ARN',
    'ZAKEN_API_URL',
    'ZGW_TOKEN_CLIENT_ID_ARN',
    'ZGW_TOKEN_CLIENT_SECRET_ARN',
    'ROLTYPES_TO_REGISTER',
    'HAALCENTRAAL_BRP_APIKEY_ARN',
    'HAALCENTRAAL_BRP_BASEURL',
  ]);

  const [openKlantApiKey, zgwClientId, zgwClientSecret, brpHaalCentraalSecret] = await Promise.all([
    AWS.getSecret(env.OPEN_KLANT_API_KEY_ARN),
    AWS.getSecret(env.ZGW_TOKEN_CLIENT_ID_ARN),
    AWS.getSecret(env.ZGW_TOKEN_CLIENT_SECRET_ARN),
    AWS.getSecret(env.HAALCENTRAAL_BRP_APIKEY_ARN),
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
    brpApi: new BRPApi({ apiKey: brpHaalCentraalSecret, baseUrl: env.HAALCENTRAAL_BRP_BASEURL }),
  };

}

let configuration : undefined | OpenKlantRegistrationServiceProps = undefined;
export async function handler(event: APIGatewayProxyEventV2) {

  if (!configuration) {
    configuration = await initalize();
  }

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
    const registrationHandler = new OpenKlantRegistrationHandler(configuration);

    // Handle the notification event
    const notification = parseNotificationFromBody(event);
    return await registrationHandler.handleNotification(notification);

  } catch (error) {
    if (error instanceof ErrorResponse) {
      return Response.error(error.statusCode, error.message);
    }
    console.error(error);
    return Response.error(500);
  }
}

function parseNotificationFromBody(event: APIGatewayProxyEventV2) : Notification {
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
    console.error(error);
    throw new ErrorResponse(400, 'Error parsing body');
  }
}
