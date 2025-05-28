import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import { NotificationSchema } from '../../Shared/model/Notification';
import { OpenKlantRegistrationHandler } from '../OpenKlantRegistrationHandler';

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
  const call = handler.handleNotification(notification);
  await expect(call).resolves.not.toThrow();
});

test('Do not handle rol of wrong type', async () => {
  const file = readFileSync(join(__dirname, 'notification-rol.json')).toString('utf-8');
  const notification = NotificationSchema.parse(JSON.parse(file));
  const handler = createHandler('behandelaar');
  const call = handler.handleNotification(notification);
  await expect(call).resolves.not.toThrow();
});


function createHandler(roltype?: string) {
  return new OpenKlantRegistrationHandler({
    zakenApiUrl: 'https://example.com/open-zaak/zaken',
    zakenApi: mockZakenApi(),
    catalogiApi: mockCatalogiApi(roltype),
    roltypesToRegister: ['initatior'],
    openKlantApi: getMockOpenKlantApiV2(),
  });
}

function mockZakenApi() {
  const zakenApiMock = getMockZakenApiV2();
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
  const catalogiApiMock = getMockCatalogiApiV2();
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


const appendUuid = (obj: any) => Promise.resolve({ uuid: randomUUID(), ...obj });

function getMockZakenApiV2() {
  const api = {
    getRol: jest.fn(),
    getZaak: jest.fn(),
    updateRol: jest.fn(),
  };
  return api;
}

function getMockCatalogiApiV2() {
  const api = {
    getRolType: jest.fn(),
  };
  return api;
}

function getMockOpenKlantApiV2() {
  const api = {
    addDigitaalAdres: appendUuid,
    addPartijIdentificatie: appendUuid,
    deleteDigitaalAdres: jest.fn(),
    findPartij: jest.fn(),
    findPartijen: jest.fn(),
    getEndpoint: jest.fn(),
    getPartij: jest.fn(),
    registerPartij: appendUuid,
    updatePartij: appendUuid,
  };
  return api;
}