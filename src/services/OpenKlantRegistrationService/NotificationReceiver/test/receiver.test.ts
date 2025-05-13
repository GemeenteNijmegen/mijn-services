import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { mockClient } from 'aws-sdk-client-mock';
import { handleAuthenticatedRequest, validateNotification } from '../receiver.lambda';

test('Accept notifications of right type', async () => {
  process.env.ZAKEN_API_URL = 'https://zgw/';
  const ignoreReasons = validateNotification({
    kanaal: 'zaken',
    actie: 'create',
    resource: 'rol',
    aanmaakdatum: '',
    hoofdObject: 'https://zgw/zaakuuid',
    resourceUrl: 'https://zgw/roluuid',
  });
  expect(ignoreReasons).toBeUndefined();
});

test('Ignore notification different url', async () => {
  process.env.ZAKEN_API_URL = 'https://zgw';
  const ignoreReasons = validateNotification({
    kanaal: 'zaken',
    actie: 'create',
    resource: 'rol',
    aanmaakdatum: '',
    hoofdObject: 'https://differenturl/zaakuuid',
    resourceUrl: 'https://differenturl/roluuid',
  });
  expect(ignoreReasons).not.toBeUndefined();
});

test('Ignore notification differnt resource', async () => {
  process.env.ZAKEN_API_URL = 'https://zgw';
  const ignoreReasons = validateNotification({
    kanaal: 'zaken',
    actie: 'create',
    resource: 'zaak',
    aanmaakdatum: '',
    hoofdObject: 'https://zgw/zaakuuid',
    resourceUrl: 'https://zgw/roluuid',
  });
  expect(ignoreReasons).not.toBeUndefined();
});


test('Sends message to queue', async () => {
  process.env.ZAKEN_API_URL = 'https://zgw/';
  const sqsMock = mockClient(SQSClient);
  const response = await handleAuthenticatedRequest({
    kanaal: 'zaken',
    actie: 'create',
    resource: 'rol',
    aanmaakdatum: '',
    hoofdObject: 'https://zgw/zaakuuid',
    resourceUrl: 'https://zgw/roluuid',
  });
  const executed = sqsMock.commandCalls(SendMessageCommand);
  expect(executed.length).toBe(1);
  expect(response.statusCode).toBe(200);
});