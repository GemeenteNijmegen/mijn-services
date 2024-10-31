
import { Bsn } from '@gemeentenijmegen/utils';
import { ZgwClient } from './ZgwClient';

const runTest = process.env.CREATE_TEST_ZAAK_LIVE === 'true' ? describe : describe.skip;

/**
 * Tests in this file can be used to create a new zaak incl. rol & status
 * This is usefull for triggering the open-klant registrataion service and
 * OMC to send notifications.
 * Below is an example of what environment variables to set in your .env file to run these tests
 * ```
 * CREATE_TEST_ZAAK_LIVE=true
 * CREATE_TEST_ZAAK_API=https://...
 * CREATE_TEST_ZAAK_ZAAKTYPE=https://...
 * CREATE_TEST_ZAAK_ROLTYPE=https://...
 * CREATE_TEST_ZAAK_STATUSTYPE=https://...
 * CREATE_TEST_ZAAK_CONTACTPERSOON_NAAM=H. de Jong
 * CREATE_TEST_ZAAK_CONTACTPERSOON_EMAIL=...@nijmegen.nl
 * CREATE_TEST_ZAAK_CONTACTPERSOON_TELEFOON=0612345656
 * ```
 */
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

