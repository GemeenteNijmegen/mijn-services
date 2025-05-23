
import { randomBytes } from 'crypto';
import { Bsn } from '@gemeentenijmegen/utils';
import { ZgwClient } from '../ZgwClient';

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
 *
 * ZAKEN_API_CLIENT_ID=...
 * ZAKEN_API_CLIENT_SECRET=...
 * ```
 */
runTest('Create zaak run live tests', () => {

  // Random ID that is logged for correlating in the zaken api
  const runid = randomBytes(20).toString('hex').substring(0, 10);
  console.log('Using ID', runid);

  test('Do multiple creates', async () => {
    await Promise.all([
      createZaak(true, '999999333'),
      createZaak(false, '69599084'),
      createZaak(true, '900222633'),
      createZaak(false, '68750110'),
    ]);
  }, 30 * 1000);

  test('Create test zaak live (BSN)', async () => {
    await createZaak(true, '999999333');
  }, 30 * 1000);

  test('Create test zaak live (kvk)', async () => {
    await createZaak(false, '68750110');
  }, 30 * 1000);

  async function createZaak(useBsn: boolean, identifier: string) {
    const client = new ZgwClient({
      name: process.env.ZAKEN_API_CLIENT_ID!,
      roltype: process.env.CREATE_TEST_ZAAK_ROLTYPE!,
      zaakstatus: process.env.CREATE_TEST_ZAAK_STATUSTYPE!,
      zaaktype: process.env.CREATE_TEST_ZAAK_ZAAKTYPE!,
      zakenApiUrl: process.env.CREATE_TEST_ZAAK_API!,
      clientId: process.env.ZAKEN_API_CLIENT_ID,
      clientSecret: process.env.ZAKEN_API_CLIENT_SECRET,
    });

    const zaakid = randomBytes(20).toString('hex').substring(0, 10);
    const zaak = await client.createZaak(`ZAAK-${runid}-${zaakid}`, 'TestVulService');
    console.log('Zaak url', zaak.url);

    console.log('Setting zaakeigenschap...');
    await client.setZaakEigenschap(process.env.CREATE_TEST_ZAAK_EIGENSCHAP!, zaak.url, zaak.uuid, 'APV33.445');
    console.log('Done setting zaakeigenschap...');

    if (useBsn) {
      await client.addBsnRoleToZaak(zaak.url, new Bsn(identifier), {
        naam: process.env.CREATE_TEST_ZAAK_CONTACTPERSOON_NAAM!,
        telefoonnummer: process.env.CREATE_TEST_ZAAK_CONTACTPERSOON_TELEFOON,
        emailadres: process.env.CREATE_TEST_ZAAK_CONTACTPERSOON_EMAIL,
      });
      await client.addStatusToZaak(zaak.url, 'Trigger vul service vanaf lokaal (bsn)');
    } else {
      await client.addKvkRoleToZaak(zaak.url, identifier, 'ExampleCompanyName', {
        naam: process.env.CREATE_TEST_ZAAK_CONTACTPERSOON_NAAM!,
        telefoonnummer: process.env.CREATE_TEST_ZAAK_CONTACTPERSOON_TELEFOON,
        emailadres: process.env.CREATE_TEST_ZAAK_CONTACTPERSOON_EMAIL,
      });
      await client.addStatusToZaak(zaak.url, 'Trigger vul service vanaf lokaal (kvk)');
    }


  }


});

