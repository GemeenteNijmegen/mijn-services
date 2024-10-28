
import { Bsn } from '@gemeentenijmegen/utils';
import { ZgwClient } from './ZgwClient';

const runTest = process.env.CREATE_TEST_ZAAK_LIVE === 'true' ? describe : describe.skip;

runTest('Create zaak run live tests', () => {

  test('Create test zaak live (BSN)', async () => {

    const client = new ZgwClient({
      name: process.env.ZAKEN_API_CLIENT_ID!,
      roltype: process.env.CREATE_TEST_ZAAK_ROLTYPE!,
      zaakstatus: process.env.CREATE_TEST_ZAAK_STATUSTYPE!,
      zaaktype: process.env.CREATE_TEST_ZAAK_ZAAKTYPE!,
      zakenApiUrl: process.env.CREATE_TEST_ZAAK_API!,
      clientId: process.env.ZAKEN_API_CLIENT_ID,
      clientSecret: process.env.ZAKEN_API_CLIENT_SECRET,
    });

    const zaak = await client.createZaak(`TEST-VUL-SERVICE-ZAAK-${Date.now()}`, 'TestVulService');

    await client.addBsnRoleToZaak(zaak.url, new Bsn('999999333'), {
      naam: process.env.CREATE_TEST_ZAAK_CONTACTPERSOON_NAAM!,
      telefoonnummer: process.env.CREATE_TEST_ZAAK_CONTACTPERSOON_TELEFOON,
      emailadres: process.env.CREATE_TEST_ZAAK_CONTACTPERSOON_EMAIL,
    });

    await client.addStatusToZaak(zaak.url, 'Trigger vul service vanaf lokaal (bsn)');

  });


  test('Create test zaak live (kvk)', async () => {

    const client = new ZgwClient({
      name: process.env.ZAKEN_API_CLIENT_ID!,
      roltype: process.env.CREATE_TEST_ZAAK_ROLTYPE!,
      zaakstatus: process.env.CREATE_TEST_ZAAK_STATUSTYPE!,
      zaaktype: process.env.CREATE_TEST_ZAAK_ZAAKTYPE!,
      zakenApiUrl: process.env.CREATE_TEST_ZAAK_API!,
      clientId: process.env.ZAKEN_API_CLIENT_ID,
      clientSecret: process.env.ZAKEN_API_CLIENT_SECRET,
    });

    const zaak = await client.createZaak(`TEST-VUL-SERVICE-ZAAK-${Date.now()}`, 'TestVulService');

    await client.addKvkRoleToZaak(zaak.url, '69599084', 'ExampleCompanyName', {
      naam: process.env.CREATE_TEST_ZAAK_CONTACTPERSOON_NAAM!,
      telefoonnummer: process.env.CREATE_TEST_ZAAK_CONTACTPERSOON_TELEFOON,
      emailadres: process.env.CREATE_TEST_ZAAK_CONTACTPERSOON_EMAIL,
    });

    await client.addStatusToZaak(zaak.url, 'Trigger vul service vanaf lokaal (kvk)');


  });

});

