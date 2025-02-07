import { ZakenApi } from '../ZakenApi';


const runLiveTests = process.env.RUN_LIVE_TESTS === 'true' ? describe : describe.skip;

runLiveTests('Live tests OpenKlantApi', () => {

  const api = new ZakenApi({
    clientId: process.env.ZAKEN_API_CLIENT_ID!,
    clientSecret: process.env.ZAKEN_API_CLIENT_SECRET!,
    zakenApiUrl: process.env.ZAKEN_API_URL!,
  });

  test('get rol informatie', async () => {
    const url = process.env.ZAKEN_API_TEST_ROL_WITH_ZAAK!;
    const rol = await api.getRol(url);
    console.log(rol);
  });

});

