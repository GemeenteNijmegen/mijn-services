import { Response } from '@gemeentenijmegen/apigateway-http';
import { AWS, environmentVariables } from '@gemeentenijmegen/utils';
import { APIGatewayProxyEventV2 } from 'aws-lambda';

// TODO make this use the authorization header and Token prefix (zgw style)

let API_KEY: string | undefined = undefined;
export async function authenticate(event: APIGatewayProxyEventV2) {
  if (!API_KEY) {
    const env = environmentVariables(['API_KEY_ARN']);
    API_KEY = await AWS.getSecret(env.API_KEY_ARN);
  }

  if (!API_KEY) {
    console.error('API_KEY was not loaded, cannot authenticate request');
    return Response.error(401);
  }

  const header = event.headers?.['x-api-key'];
  if (!header) {
    console.error('No x-api-key header fount in the request');
    return Response.error(401, 'No x-api-key header fount in the request' );
  }

  if (header === API_KEY) {
    return true;
  }

  console.error('Invalid API key');
  return Response.error(401, 'Invalid API key.');

}