import { Notification } from '../../Shared/model/Notification';
import { CatalogiApi } from '../CatalogiApi';
import { OpenKlantApi } from '../OpenKlantApi';
import { OpenKlantRegistrationHandler } from '../OpenKlantRegistrationHandler';
import { ZakenApi } from '../ZakenApi';

const runLiveTests = process.env.RUN_LIVE_TESTS === 'true' ? describe : describe.skip;

runLiveTests('Live tests handle notification', () => {

  const openKlantApi = new OpenKlantApi({
    url: process.env.OPEN_KLANT_API_URL!,
    apikey: process.env.OPEN_KLANT_API_KEY!,
  });

  const zakenApi = new ZakenApi({
    clientId: process.env.ZAKEN_API_CLIENT_ID!,
    clientSecret: process.env.ZAKEN_API_CLIENT_SECRET!,
    zakenApiUrl: process.env.ZAKEN_API_URL!,
  });

  const catalogiApi = new CatalogiApi({
    clientId: process.env.ZAKEN_API_CLIENT_ID!,
    clientSecret: process.env.ZAKEN_API_CLIENT_SECRET!,
  });

  test('Handles notification', async () => {
    const handler = new OpenKlantRegistrationHandler({
      openKlantApi: openKlantApi,
      zakenApi: zakenApi,
      catalogiApi: catalogiApi,
      zakenApiUrl: process.env.ZAKEN_API_URL!,
      roltypesToRegister: ['initiator'],
    });
    // If not throws thats ok
    await handler.handleNotification(composeNotification());
  });

});

function composeNotification(): Notification {
  return {
    kanaal: 'zaken',
    hoofdObject: process.env.ZAKEN_API_TEST_ZAAK_WITH_ROL!,
    resource: 'rol',
    resourceUrl: process.env.ZAKEN_API_TEST_ROL_WITH_ZAAK!,
    actie: 'create',
    aanmaakdatum: new Date().toISOString(),
    kenmerken: {
      theContentOfThisObjectIsNotUsed: true,
    },
  };
}