import { randomUUID } from 'crypto';
import { Notification } from '../../Shared/model/Notification';
import { OpenKlantDigitaalAdresWithUuid, OpenKlantPartijWithUuid } from '../../Shared/model/Partij';
import { Rol } from '../../Shared/model/Rol';
import { RolType } from '../../Shared/model/RolType';
import { Submission } from '../../Shared/model/Submisison';
import { Zaak } from '../../Shared/model/Zaak';
import { PartijPerRolStrategyWithForm } from '../strategies/PartijPerRolStrategyWithForm';
import { NotFoundError } from '../ZgwApi';


const CATALOGUS_UUID = '0000-0000-0000-0000';

describe('RolStrategyWithForm', () => {

  const openKlantMock = getMockOpenKlantApiV2();
  const catalogiMock = getMockCatalogiApiV2();
  const zakenMock = getMockZakenApiV2();
  const submissionStorageMock = getMockSubmissionStorageV2();

  const strategy = new PartijPerRolStrategyWithForm({
    catalogiApi: catalogiMock,
    openKlantApi: openKlantMock,
    zakenApi: zakenMock,
    zakenApiUrl: 'https://example.com/zaken/api/v1/zaken',
    roltypesToRegister: ['initiator'],
    catalogusUuids: [CATALOGUS_UUID],
  }, true, submissionStorageMock);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('Should handle rol of type initatior from this catalogus', () => {
    const roltype: Partial<RolType> = {
      omschrijvingGeneriek: 'initiator',
      catalogus: `https://example.com/catalogi/api/v1/catalogussen/${CATALOGUS_UUID}`,
    };
    strategy.shouldHandleRolOfThisType(roltype as RolType);
  });

  test('Should not handle rol of other type than initatior', () => {
    const roltype: Partial<RolType> = {
      omschrijvingGeneriek: 'behandelaar',
      catalogus: `https://example.com/catalogi/api/v1/catalogussen/${CATALOGUS_UUID}`,
    };
    strategy.shouldHandleRolOfThisType(roltype as RolType);
  });

  test('Should not handle rol of other catalogus', () => {
    const roltype: Partial<RolType> = {
      omschrijvingGeneriek: 'initiator',
      catalogus: 'https://example.com/catalogi/api/v1/catalogussen/1234-1234-1224-1234',
    };
    strategy.shouldHandleRolOfThisType(roltype as RolType);
  });

  test('Can update rol with betrokkene veld', async () => {
    // Setup
    const partijUuid = randomUUID();
    openKlantMock.getEndpoint.mockReturnValue('https://example.com/open-klant/api/v1/');
    const rol: Partial<Rol> = {
      omschrijvingGeneriek: 'initiator',
      catalogus: 'https://example.com/catalogi/api/v1/catalogussen/1234-1234-1224-1234',
    };
    // Call
    await strategy.updateRolWithParijUrl(partijUuid, rol as Rol);
    // Test
    expect(zakenMock.updateRol).toHaveBeenCalledTimes(1);
  });

  test('Can handle natuurlijk persoon rol', async () => {
    // Setup
    const rol: Partial<Rol> = {
      uuid: randomUUID(),
      omschrijvingGeneriek: 'initiator',
      betrokkeneType: 'natuurlijk_persoon',
      catalogus: 'https://example.com/catalogi/api/v1/catalogussen/1234-1234-1224-1234',
      contactpersoonRol: {
        naam: 'H. de Jong',
        telefoonnummer: 'deze komt niet uit de rol maar uit het formulier',
        emailadres: 'deze komt niet uit de rol maar uit het formulier',
      },
      betrokkeneIdentificatie: {
        inpBsn: '999999333', // BSN
        geslachtsnaam: 'H. de Jong (deze wordt niet gebruikt)',
      },
    };

    // Call
    const partij = await strategy.handleNatuurlijkPersoonNew(rol as Rol);

    // Test
    expect(partij.soortPartij).toBe('persoon');

    const identificatie = partij.partijIdentificatie as any;
    expect(identificatie.volledigeNaam).toBe('H. de Jong');
    expect(identificatie.contactnaam.voornaam).toBe('H. de Jong');

    expect(openKlantMock.addPartijIdentificatie).toHaveBeenCalledTimes(1);
  });

  test('Can handle niet natuurlijk persoon rol', async () => {
    // Setup
    const rol: Partial<Rol> = {
      uuid: randomUUID(),
      omschrijvingGeneriek: 'initiator',
      betrokkeneType: 'niet_natuurlijk_persoon',
      catalogus: 'https://example.com/catalogi/api/v1/catalogussen/1234-1234-1224-1234',
      betrokkeneIdentificatie: {
        annIdentificatie: '123456', // KVK,
        statutaireNaam: 'Bedrijfsnaam',
        geslachtsnaam: 'H. de Jong',
      },
    };

    // Call
    const partij = await strategy.handleNietNatuurlijkPersoonNew(rol as Rol);

    // Test
    expect(partij.soortPartij).toBe('persoon');

    const identificatie = partij.partijIdentificatie as any;
    expect(identificatie.volledigeNaam).toBe('H. de Jong'); // Dit is dus gebaseerd op het geslachtsnaam veld
    expect(identificatie.contactnaam.voornaam).toBe('H. de Jong');

    expect(openKlantMock.addPartijIdentificatie).toHaveBeenCalledTimes(1);
  });


  test('Use sms when setDigitaleAdressenForPartijFromRol preference', async () => {
    // Setup
    const form = {
      submission: {
        Message: JSON.stringify(
          {
            eMailadres: 'abc@example.com',
            telefoon: '+31612345678',
            hoeWiltUOpDeHoogteGehoudenWorden: 'sms',
          }),
      },
    };
    const partij: Partial<OpenKlantPartijWithUuid> = {
      uuid: randomUUID(),
    };

    // Call
    await strategy.setDigitaleAdressenForPartijFromRol(partij as OpenKlantPartijWithUuid, form);

    // Test
    expect(openKlantMock.updatePartij).toHaveBeenCalled();
    expect(openKlantMock.addDigitaalAdres).toHaveBeenCalledTimes(2);

    // expect: telefoon as voorkeur
    const telefoon = openKlantMock.addDigitaalAdres.mock.results[0].value as OpenKlantDigitaalAdresWithUuid;
    const email = openKlantMock.addDigitaalAdres.mock.results[1].value as OpenKlantDigitaalAdresWithUuid;
    const updatePartij = openKlantMock.updatePartij.mock.lastCall[0] as OpenKlantPartijWithUuid;
    expect(updatePartij.voorkeursDigitaalAdres?.uuid).toBe(telefoon.uuid);
    expect(updatePartij.voorkeursDigitaalAdres?.uuid).not.toBe(email.uuid);

  });

  test('Use email when setDigitaleAdressenForPartijFromRol preference', async () => {
    // Setup
    const form = {
      submission: {
        Message: JSON.stringify(
          {
            eMailadres: 'abc@example.com',
            telefoon: '+31612345678',
            hoeWiltUOpDeHoogteGehoudenWorden: 'email',
          },
        ),
      },
    };
    const partij: Partial<OpenKlantPartijWithUuid> = {
      uuid: randomUUID(),
    };

    // Call
    await strategy.setDigitaleAdressenForPartijFromRol(partij as OpenKlantPartijWithUuid, form);

    // Test
    expect(openKlantMock.updatePartij).toHaveBeenCalled();
    expect(openKlantMock.addDigitaalAdres).toHaveBeenCalledTimes(2);

    // expect: telefoon as voorkeur
    const telefoon = openKlantMock.addDigitaalAdres.mock.results[0].value as OpenKlantDigitaalAdresWithUuid;
    const email = openKlantMock.addDigitaalAdres.mock.results[1].value as OpenKlantDigitaalAdresWithUuid;
    const updatePartij = openKlantMock.updatePartij.mock.lastCall[0] as OpenKlantPartijWithUuid;
    expect(updatePartij.voorkeursDigitaalAdres?.uuid).not.toBe(telefoon.uuid);
    expect(updatePartij.voorkeursDigitaalAdres?.uuid).toBe(email.uuid);

  });

  test('Use sms when no preference in setDigitaleAdressenForPartijFromRol', async () => {
    // Setup
    const form = {
      submission: {
        Message: JSON.stringify(
          {
            eMailadres: 'abc@example.com',
            telefoon: '+31612345678',
            // hoeWiltUOpDeHoogteGehoudenWorden: 'email' // Do not prived a preference for this test
          }),
      },
    };
    const partij: Partial<OpenKlantPartijWithUuid> = {
      uuid: randomUUID(),
    };

    // Call
    await strategy.setDigitaleAdressenForPartijFromRol(partij as OpenKlantPartijWithUuid, form);

    // Test
    expect(openKlantMock.updatePartij).toHaveBeenCalled();
    expect(openKlantMock.addDigitaalAdres).toHaveBeenCalledTimes(2);

    // expect: telefoon as voorkeur
    const telefoon = openKlantMock.addDigitaalAdres.mock.results[0].value as OpenKlantDigitaalAdresWithUuid;
    const email = openKlantMock.addDigitaalAdres.mock.results[1].value as OpenKlantDigitaalAdresWithUuid;
    const updatePartij = openKlantMock.updatePartij.mock.lastCall[0] as OpenKlantPartijWithUuid;
    expect(updatePartij.voorkeursDigitaalAdres?.uuid).toBe(telefoon.uuid);
    expect(updatePartij.voorkeursDigitaalAdres?.uuid).not.toBe(email.uuid);

  });

  test('Use email when only option in setDigitaleAdressenForPartijFromRol when preference is SMS', async () => {
    // Setup
    const form = {
      submission: {
        Message: JSON.stringify(
          {
            eMailadres: 'abc@example.com',
            // telefoon: '+31612345678',
            hoeWiltUOpDeHoogteGehoudenWorden: 'sms', // Do not prived a preference for this test
          }),
      },
    };
    const partij: Partial<OpenKlantPartijWithUuid> = {
      uuid: randomUUID(),
    };

    // Call
    await strategy.setDigitaleAdressenForPartijFromRol(partij as OpenKlantPartijWithUuid, form);

    // Test
    expect(openKlantMock.updatePartij).toHaveBeenCalled();
    expect(openKlantMock.addDigitaalAdres).toHaveBeenCalledTimes(1);

    // expect: telefoon as voorkeur
    const email = openKlantMock.addDigitaalAdres.mock.results[0].value as OpenKlantDigitaalAdresWithUuid;
    const updatePartij = openKlantMock.updatePartij.mock.lastCall[0] as OpenKlantPartijWithUuid;
    expect(updatePartij.voorkeursDigitaalAdres?.uuid).toBe(email.uuid);

  });

  test('Use sms when only option in setDigitaleAdressenForPartijFromRol when preference is email', async () => {
    // Setup
    const form = {
      submission: {
        Message: JSON.stringify(
          {
            // eMailadres: 'abc@example.com',
            telefoon: '+31612345678',
            hoeWiltUOpDeHoogteGehoudenWorden: 'e-mail', // Do not prived a preference for this test
          }),
      },
    };
    const partij: Partial<OpenKlantPartijWithUuid> = {
      uuid: randomUUID(),
    };

    // Call
    await strategy.setDigitaleAdressenForPartijFromRol(partij as OpenKlantPartijWithUuid, form);

    // Test
    expect(openKlantMock.updatePartij).toHaveBeenCalled();
    expect(openKlantMock.addDigitaalAdres).toHaveBeenCalledTimes(1);

    // expect: telefoon as voorkeur
    const telefoon = openKlantMock.addDigitaalAdres.mock.results[0].value as OpenKlantDigitaalAdresWithUuid;
    const updatePartij = openKlantMock.updatePartij.mock.lastCall[0] as OpenKlantPartijWithUuid;
    expect(updatePartij.voorkeursDigitaalAdres?.uuid).toBe(telefoon.uuid);

  });

  test('Throws error setDigitaleAdressenForPartijFromRol no values', async () => {
    // Setup
    const form = { // No values in the form
      submission: {
        Message: JSON.stringify(
          {
            // eMailadres: 'abc@example.com',
            // telefoon: '+31612345678',
            // hoeWiltUOpDeHoogteGehoudenWorden: 'e-mail' // Do not prived a preference for this test
          }),
      },
    };
    const partij: Partial<OpenKlantPartijWithUuid> = {
      uuid: randomUUID(),
    };

    // Call
    const call = strategy.setDigitaleAdressenForPartijFromRol(partij as OpenKlantPartijWithUuid, form);
    await expect(call).rejects.toThrow('Failed to set a preference as we do not have any registered digitaal adres');

    // Test
    expect(openKlantMock.updatePartij).not.toHaveBeenCalled();
    expect(openKlantMock.addDigitaalAdres).not.toHaveBeenCalled();

  });


  test('Register with natuurlijk persoon', async () => {
    // Mock
    setupMockForTestingRegister('persoon', false);
    // Call
    await strategy.register(getTestNotification());
    // Test
    expect(strategy.updateRolWithParijUrl).toHaveBeenCalled(); // Test if update call is done
    expect(openKlantMock.getPartij).not.toHaveBeenCalled();
    // expect(submissionStorageMock.getFormJson).toHaveBeenCalledWith<[string, string, string]>('APV.123', '999999333', 'person');
  });

  test('Register with natuurlijk persoon and existing partij', async () => {
    // Mock
    setupMockForTestingRegister('persoon', true);
    // Call
    await strategy.register(getTestNotification());
    // Test
    expect(strategy.updateRolWithParijUrl).not.toHaveBeenCalled(); // Test if update call is done
    expect(openKlantMock.getPartij).toHaveBeenCalled();
    expect(submissionStorageMock.getFormJson).toHaveBeenCalledWith<[string, string, string]>('APV.123', '999999333', 'person');
  });

  test('Register with niet natuurlijk persoon', async () => {
    // Mock
    setupMockForTestingRegister('organisatie', false);
    // Call
    await strategy.register(getTestNotification());
    // Test
    expect(strategy.updateRolWithParijUrl).toHaveBeenCalled(); // Test if update call is done
  });

  test('Register while failed to create partij fails throws error', async () => {
    // Mock
    setupMockForTestingRegister('persoon', false);
    strategy.handleNatuurlijkPersoonNew = jest.fn().mockRejectedValue(new Error('Some error'));
    // Call
    const call = strategy.register(getTestNotification());
    // Test
    await expect(call).rejects.toThrow();
  });

  test('Register while failed to update partij throws error', async () => {
    // Mock
    setupMockForTestingRegister('persoon', false);
    strategy.updateRolWithParijUrl = jest.fn().mockRejectedValue(new Error('Some error'));
    // Call
    const call = strategy.register(getTestNotification());
    // Test
    await expect(call).rejects.toThrow();
  });

  test('Register while rol not found is ok', async () => {
    // Mock
    setupMockForTestingRegister('persoon', false);
    zakenMock.getRol.mockRejectedValue(new NotFoundError('rol'));
    // Call
    const call = strategy.register(getTestNotification());
    // Test
    await expect(call).resolves.not.toThrow();
  });


  test('Register while partij already exists reuses partij', async () => {
    // Mock
    setupMockForTestingRegister('persoon', false);

    // Mock rol
    zakenMock.getRol.mockResolvedValue({
      uuid: randomUUID(),
      omschrijvingGeneriek: 'initiator',
      betrokkeneType: 'natuurlijk_persoon',
      betrokkene: 'https://example.com/open-klant/api/v1/partijen',
      betrokkeneIdentificatie: {
        inpBsn: '999999333', // BSN
        geslachtsnaam: 'H. de Jong',
      },
    } as Partial<Rol>);

    const partij = {
      uuid: randomUUID(),
    } as Partial<OpenKlantPartijWithUuid>;
    openKlantMock.getPartij.mockResolvedValue(partij);

    // Call
    await strategy.register(getTestNotification());
    // Test
    expect(strategy.setDigitaleAdressenForPartijFromRol).toHaveBeenCalledTimes(1);
    expect((strategy.setDigitaleAdressenForPartijFromRol as jest.Mock).mock.lastCall[0]).toBe(partij);
  });


  // Test cases
  // Rol not found
  // Niet natuurlijk persoon
  // Zaakeignschap bestaat niet


  // TODO add tests of parsing for actual APV formulieren

  function getTestNotification(): Notification {
    const notification: Partial<Notification> = {
      kanaal: 'zaken',
      actie: 'create',
      resource: 'rol',
      resourceUrl: 'https://example.com/zaken/api/v1/rollen/' + randomUUID(),
      hoofdObject: 'https://example.com/zaken/api/v1/zaken/' + randomUUID(),
    };
    return notification as Notification;
  }

  function setupMockForTestingRegister(soort: 'persoon' | 'organisatie', hasExistingPartij: boolean) {

    const betrokkene = hasExistingPartij ? 'https://example.com/open-klant/partijen/abcdef-123-123' : undefined;
    // Mock rol
    if (soort == 'persoon') {
      zakenMock.getRol.mockResolvedValue({
        uuid: randomUUID(),
        omschrijvingGeneriek: 'initiator',
        betrokkene: betrokkene,
        betrokkeneType: 'natuurlijk_persoon',
        betrokkeneIdentificatie: {
          inpBsn: '999999333', // BSN
          geslachtsnaam: 'H. de Jong',
        },
      } as Partial<Rol>);
    } else {
      zakenMock.getRol.mockResolvedValue({
        uuid: randomUUID(),
        omschrijvingGeneriek: 'initiator',
        betrokkeneType: 'niet_natuurlijk_persoon',
        betrokkene: betrokkene,
        betrokkeneIdentificatie: {
          annIdentificatie: '123456', // KVK
          geslachtsnaam: 'H. de Jong',
          statutaireNaam: 'Bedrijfsnaam',
        },
      } as Partial<Rol>);
    }

    // Mock roltype
    catalogiMock.getRolType.mockResolvedValue({
      catalogus: `https://example.com/catalogi/api/v1/catalogussen/${CATALOGUS_UUID}`,
      omschrijvingGeneriek: 'initiator',
    } as Partial<RolType>);

    // Mock roltype
    openKlantMock.getPartij.mockResolvedValue({
      uuid: randomUUID(),
    } as Partial<OpenKlantPartijWithUuid>);

    // Mock zaak
    const zaakUuid = randomUUID();
    zakenMock.getZaak.mockResolvedValue({
      url: `https://example.com/zaken/api/v1/zaken/${zaakUuid}`,
      uuid: zaakUuid,
      _expand: {
        eigenschappen: [
          {
            eigenschap: `https://example.com/catalogi/api/v1/eigenschappen/${randomUUID()}`,
            url: `https://example.com/zaken/api/v1/zaken/${zaakUuid}/eigenschappen/1234`,
            uuid: '1234',
            naam: 'formulier_referentie',
            waarde: 'APV.123',
          },
        ],
      },
    } as Partial<Zaak>);

    // Mock submission
    submissionStorageMock.getFormJson.mockResolvedValue({
      submission: {
        eMailadres: 'test@example.com',
      },
    } as Partial<Submission>);

    // Mock internal methods of strategy (tested separately)
    strategy.shouldHandleRolOfThisType = jest.fn().mockImplementation(() => true);
    strategy.handleNatuurlijkPersoonNew = jest.fn().mockResolvedValue({
      uuid: randomUUID(),
      soortPartij: 'persoon',
      partijIdentificatie: {
        contactnaam: 'H. de Jong',
        volledigeNaam: 'H. de Jong',
      },
    } as Partial<OpenKlantPartijWithUuid>);
    strategy.updateRolWithParijUrl = jest.fn();
    strategy.setDigitaleAdressenForPartijFromRol = jest.fn();
  }


});


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
    addDigitaalAdres: addUuidMock(),
    addPartijIdentificatie: jest.fn(),
    deleteDigitaalAdres: jest.fn(),
    findPartij: jest.fn(),
    findPartijen: jest.fn(),
    getEndpoint: jest.fn(),
    getPartij: jest.fn(),
    registerPartij: addUuidMock(),
    updatePartij: jest.fn(),
  };
  return api;
}

function getMockSubmissionStorageV2() {
  const api = {
    getFormJson: jest.fn(),
  };
  return api;
}

function addUuidMock() {
  return jest.fn().mockImplementation((obj: any) => {
    return {
      ...obj,
      uuid: randomUUID(),
    };
  });
}