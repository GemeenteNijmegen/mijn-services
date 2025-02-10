import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import { ApiGatewayV2Response } from '@gemeentenijmegen/apigateway-http';
import { NotificationSchema } from '../../Shared/model/Notification';
import { CatalogiApiMock } from '../CatalogiApi';
import { OpenKlantApiMock } from '../OpenKlantApi';
import { OpenKlantRegistrationHandler } from '../OpenKlantRegistrationHandler';
import { ZakenApiMock } from '../ZakenApi';

beforeAll(() => {
  process.env.DEBUG = 'true';
});

test('Creation of handler class', () => {
  createHandler();
});

test('Unsupported notification returns error', async () => {
  const file = readFileSync(join(__dirname, 'notification-zaak.json')).toString('utf-8');
  const notification = NotificationSchema.parse(JSON.parse(file));
  const handler = createHandler();
  const response = await handler.handleNotification(notification);
  expect((response as ApiGatewayV2Response).statusCode).toBe(206);
});

test('Do not handle rol of wrong type', async () => {
  const file = readFileSync(join(__dirname, 'notification-rol.json')).toString('utf-8');
  const notification = NotificationSchema.parse(JSON.parse(file));
  const handler = createHandler('behandelaar');
  const response = await handler.handleNotification(notification);
  expect((response as ApiGatewayV2Response).statusCode).toBe(200);
});


function createHandler(roltype?: string) {
  return new OpenKlantRegistrationHandler({
    zakenApiUrl: 'https://example.com/open-zaak/zaken',
    zakenApi: mockZakenApi(),
    catalogiApi: mockCatalogiApi(roltype),
    roltypesToRegister: ['initatior'],
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
      roltype: 'https://example.com/open-zaak/zaken/api/v1/rollen/000-000-000-000',
      betrokkeneIdentificatie: {
        inpBsn: '12345678',
      },
      betrokkeneType: 'natuurlijk_persoon',
    });
  });
  return zakenApiMock;
}

function mockCatalogiApi(roltype?: string) {
  const catalogiApiMock = new CatalogiApiMock();
  jest.spyOn(catalogiApiMock, 'getRolType').mockImplementation((url: string) => {
    return Promise.resolve({
      url: url,
      omschrijving: 'Test',
      omschrijvingGeneriek: roltype as any ?? 'initiator',
      zaaktype: 'https://example.com/open-zaak/catalogi/api/v1/zaaktypen/000-000-000-000',
    });
  });
  return catalogiApiMock;
}

function mockOpenKlantApi() {
  const openKlantApiMock = new OpenKlantApiMock();
  const appendUuid = (obj: any) => Promise.resolve({ uuid: randomUUID(), ...obj });
  jest.spyOn(openKlantApiMock, 'registerPartij').mockImplementation(appendUuid);
  jest.spyOn(openKlantApiMock, 'updatePartij').mockImplementation(appendUuid);
  jest.spyOn(openKlantApiMock, 'addPartijIdentificatie').mockImplementation(appendUuid);
  jest.spyOn(openKlantApiMock, 'addDigitaalAdres').mockImplementation(appendUuid);
  return openKlantApiMock;
}