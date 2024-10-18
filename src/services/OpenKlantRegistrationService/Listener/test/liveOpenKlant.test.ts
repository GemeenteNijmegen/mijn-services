import { IOpenKlantApi, OpenKlantApi } from '../OpenKlantApi';
import { OpenKlantMapper } from '../OpenKlantMapper';

const runLiveTests = process.env.RUN_LIVE_TESTS === 'true' ? describe : describe.skip;

runLiveTests('Live tests OpenKlantApi', () => {

  const api = new OpenKlantApi({
    url: process.env.OPEN_KLANT_API_URL!,
    apikey: process.env.OPEN_KLANT_API_KEY!,
  });

  test('create partij plain', async () => {
    await createPartijPersoon(api);
  });

  test('create partij organisatie', async () => {
    const result = await createPartijOrganisatie(api);
    console.log(JSON.stringify(result, null, 4));
  });

  test('create partij identificatie organisatie', async () => {
    // const partij = await createPartijOrganisatie(api);
    await createPartijIdentificatieOrganisatie(api, '8cdabbd0-83d4-4772-a393-e12f4a6ba1d0');
  });

  test('create partij identificatie', async () => {
    // const partij = await createPartijPersoon(api);
    await createPartijIdentificatie(api, '65fc6b49-4a3c-4213-ae7a-d2769762d79f');
  });

  test('create digitaal adres', async () => {
    const partij = await createPartijPersoon(api);
    await createDigitaalAdres(api, partij.uuid);
  });

});

async function createPartijPersoon(api: IOpenKlantApi) {
  return api.registerPartij({
    digitaleAdressen: [],
    indicatieActief: true,
    partijIdentificatie: {
      volledigeNaam: 'Live Test Partij',
      contactnaam: null,
    },
    rekeningnummers: [],
    soortPartij: 'persoon',
    voorkeursDigitaalAdres: null,
    voorkeursRekeningnummer: null,
    voorkeurstaal: 'dut',
    indicatieGeheimhouding: false,
  });
}


async function createPartijOrganisatie(api: IOpenKlantApi) {
  return api.registerPartij({
    digitaleAdressen: [],
    indicatieActief: true,
    partijIdentificatie: {
      volledigeNaam: 'Live Test Partij',
      contactnaam: 'Test Live Partij',
    },
    rekeningnummers: [],
    soortPartij: 'organisatie',
    voorkeursDigitaalAdres: null,
    voorkeursRekeningnummer: null,
    voorkeurstaal: 'dut',
    indicatieGeheimhouding: false,
  });
}


async function createPartijIdentificatie(api: IOpenKlantApi, partijUuid: string) {
  return api.addPartijIdentificatie({
    identificeerdePartij: {
      uuid: partijUuid,
    },
    partijIdentificator: {
      codeObjecttype: 'INGESCHREVEN NATUURLIJK PERSOON',
      codeSoortObjectId: 'Burgerservicenummer',
      objectId: '99999966',
      codeRegister: 'BRP',
    },
  });
}

async function createPartijIdentificatieOrganisatie(api: IOpenKlantApi, partijUuid: string) {
  return api.addPartijIdentificatie({
    identificeerdePartij: {
      uuid: partijUuid,
    },
    partijIdentificator: {
      codeObjecttype: 'NIET NATUURLIJK PERSOON',
      codeSoortObjectId: 'Kvknummer',
      objectId: '99999966',
      codeRegister: 'KVK',
    },
  });
}


async function createDigitaalAdres(api: IOpenKlantApi, partijUuid: string) {
  return api.addDigitaalAdres({
    adres: 'local-live-test@example.com',
    omschrijving: 'Email',
    soortDigitaalAdres: OpenKlantMapper.EMAIL,
    verstrektDoorPartij: {
      uuid: partijUuid,
    },
    verstrektDoorBetrokkene: null,
  });
}