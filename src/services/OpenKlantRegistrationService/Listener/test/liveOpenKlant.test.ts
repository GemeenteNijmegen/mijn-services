import { IOpenKlantApi, OpenKlantApi } from '../OpenKlantApi';
import { OpenKlantMapper } from '../OpenKlantMapper';

const runLiveTests = process.env.RUN_LIVE_TESTS === 'true' ? describe : describe.skip;

runLiveTests('Live tests OpenKlantApi', () => {

  const api = new OpenKlantApi({
    url: process.env.OPEN_KLANT_API_URL!,
    apikey: process.env.OPEN_KLANT_API_KEY!,
  });

  test('create partij plain', async () => {
    await createPartij(api);
  });

  test('create partij identificatie', async () => {
    const partij = await createPartij(api);
    await createPartijIdentificatie(api, partij.uuid);
  });

  test('create digitaal adres', async () => {
    const partij = await createPartij(api);
    await createDigitaalAdres(api, partij.uuid);
  });

});

async function createPartij(api: IOpenKlantApi) {
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