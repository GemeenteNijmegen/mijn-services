import { Response } from '@gemeentenijmegen/apigateway-http';
import { AWS, environmentVariables } from '@gemeentenijmegen/utils';
import { APIGatewayProxyEventV2 } from 'aws-lambda';

const ALLOWED_HEADERS = [
  'X-Authorization',
  'X-Authorization',
  'Authorization',
  'authorization',
  'x-api-key',
];

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

  if (!event.headers) {
    return Response.error(401, 'No headers available to check for API key');
  }

  const usedHeader = ALLOWED_HEADERS.find(h => event.headers[h] != undefined);
  if (!usedHeader) {
    return Response.error(401, 'No headers available to check for API key');
  }

  const header = event.headers[usedHeader];

  if (!header) {
    console.error('No Authorization header found in the request.');
    return Response.error(401, 'No Authorization header found in the request.' );
  }

  if (!header.startsWith('Token ')) {
    console.error('Header is missing the \'Token \' prefix');
    return Response.error(401, 'Authorization header must be of type Token' );
  }

  if (header.substring('Token '.length) === API_KEY) {
    return true;
  }

  console.error('Invalid API key');
  return Response.error(401, 'Invalid API key.');

}