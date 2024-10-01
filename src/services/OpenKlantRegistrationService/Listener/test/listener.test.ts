import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { ApiGatewayV2Response } from '@gemeentenijmegen/apigateway-http';
import { NotificationSchema } from '../model/Notification';
import { OpenKlantApiMock } from '../OpenKlantApi';
import { OpenKlantRegistrationHandler } from '../OpenKlantRegistrationHandler';
import { ZakenApiMock } from '../ZakenApi';

const TARGET_ROL_TYPE = 'https://example.com/open-zaak/zaken/api/v1/rollen/000-000-000-000';

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
    zakenApiUrl: 'https://example.com/open-zaak/zaken',
    zakenApi: mockZakenApi(),
    targetRolType: TARGET_ROL_TYPE,
    openKlantApi: mockOpenKlantApi(),
  });
}

function mockZakenApi() {
  const zakenApiMock = new ZakenApiMock();
  jest.spyOn(zakenApiMock, 'getRol').mockImplementation((url: string) => {
    return Promise.resolve({
      url: url,
      contactpersoonRol: {
        naam: 'Test Tester',
        emailadres: 'test@example.com',
        telefoonnummer: '06333333333',
      },
      uuid: randomUUID(),
      zaak: 'https://example.com/open-zaak/zaken/api/v1/zaak/000-000-000-000',
      roltype: TARGET_ROL_TYPE,
      betrokkeneIdentificatie: {
        inpBsn: '12345678',
      },
      betrokkeneType: 'natuurlijk_persoon',
    });
  });
  return zakenApiMock;
}

function mockOpenKlantApi() {
  const openKlantApiMock = new OpenKlantApiMock();
  const appendUuid = (obj: any) => Promise.resolve({ uuid: randomUUID(), ...obj });
  jest.spyOn(openKlantApiMock, 'registerPartij').mockImplementation(appendUuid);
  jest.spyOn(openKlantApiMock, 'addPartijIdentificatie').mockImplementation(appendUuid);
  jest.spyOn(openKlantApiMock, 'addDigitaalAdres').mockImplementation(appendUuid);
  return openKlantApiMock;
}