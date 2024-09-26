import { readFileSync } from 'fs';
import { ApiGatewayV2Response } from '@gemeentenijmegen/apigateway-http';
import { NotificationSchema } from '../Notification';
import { OpenKlantRegistrationHandler } from '../OpenKlantRegistrationHandler';
import { ZakenApiMock } from '../ZakenApi';


beforeAll(() => {
  process.env.DEBUG = 'true';
});

test('Creation of handler class', () => {
  createHandler();
});

test('Unsupported notification returns error', async () => {
  const file = readFileSync('./src/services/OpenKlantRegistrationService/Listener/test/notification-zaak.json').toString('utf-8');
  const notification = NotificationSchema.parse(JSON.parse(file));
  const handler = createHandler();
  const response = await handler.handleNotification(notification);
  expect((response as ApiGatewayV2Response).statusCode).toBe(400);
});

test('Handles role added to zaak notification (happy flow)', async () => {
  const file = readFileSync('./src/services/OpenKlantRegistrationService/Listener/test/notification-rol.json').toString('utf-8');
  const notification = NotificationSchema.parse(JSON.parse(file));
  const handler = createHandler();
  const response = await handler.handleNotification(notification);
  expect((response as ApiGatewayV2Response).statusCode).toBe(200);
});


function createHandler() {
  return new OpenKlantRegistrationHandler({
    openKlantApiKey: 'geheim',
    openKlantApiUrl: 'https://example.com/open-klant',
    zakenApiUrl: 'https://example.com/open-zaak/zaken',
    zakenApi: new ZakenApiMock(),
    targetRolType: 'https://example.com/zaken/rollen/000-000-000-000',
  });
}