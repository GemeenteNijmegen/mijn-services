import { ApiGatewayV2Response } from '@gemeentenijmegen/apigateway-http';
import { AWS } from '@gemeentenijmegen/utils';
import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { authenticate } from '../authenticate';


beforeAll(() => {
  process.env.API_KEY_ARN = 'api-key-arn';
});

describe('Authentication', () => {

  test('No key loaded returns 401', async () => {
    jest.spyOn(AWS, 'getSecret').mockImplementation((_arn) => {
      return Promise.resolve(undefined) as any;
    });
    const event: Partial<APIGatewayProxyEventV2> = {
      headers: {
      },
    };
    const result = await authenticate(event as any);
    expect(result instanceof Boolean).toBe(false);
    expect((result as ApiGatewayV2Response).statusCode).toBe(401);
  });


  test('No key in request returns 401', async () => {
    jest.spyOn(AWS, 'getSecret').mockImplementation((_arn) => {
      return Promise.resolve('geheim');
    });
    const event: Partial<APIGatewayProxyEventV2> = {
      headers: {
      },
    };
    const result = await authenticate(event as any);
    expect(result instanceof Boolean).toBe(false);
    expect((result as ApiGatewayV2Response).statusCode).toBe(401);
  });

  test('Wrong key in request returns 401', async () => {
    jest.spyOn(AWS, 'getSecret').mockImplementation((_arn) => {
      return Promise.resolve('geheim');
    });
    const event: Partial<APIGatewayProxyEventV2> = {
      headers: {
        'x-api-key': 'abc',
      },
    };
    const result = await authenticate(event as any);
    expect(result instanceof Boolean).toBe(false);
    expect((result as ApiGatewayV2Response).statusCode).toBe(401);
  });

  test('Success', async () => {
    jest.spyOn(AWS, 'getSecret').mockImplementation((_arn) => {
      return Promise.resolve('geheim');
    });
    const event: Partial<APIGatewayProxyEventV2> = {
      headers: {
        'x-api-key': 'geheim',
      },
    };
    const result = await authenticate(event as any);
    expect(result).toBe(true);
  });

});