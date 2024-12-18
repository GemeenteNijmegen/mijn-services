import { Bsn, environmentVariables } from '@gemeentenijmegen/utils';
import { BRPApi } from '../BRPApi';

beforeAll(() => {
});

const runLiveTests = process.env.RUN_LIVE_TESTS === 'true' ? describe : describe.skip;

process.env.DEBUG = 'true';
process.env.HAALCENTRAAL_BRP_APIKEY = process.env.HAALCENTRAAL_BRP_APIKEY ?? 'fakekey';
process.env.HAALCENTRAAL_BRP_BASEURL = process.env.HAALCENTRAAL_BRP_BASEURL ?? 'http://localhost';
const env = environmentVariables(['HAALCENTRAAL_BRP_APIKEY', 'HAALCENTRAAL_BRP_BASEURL']);

const config = { apiKey: env.HAALCENTRAAL_BRP_APIKEY, baseUrl: env.HAALCENTRAAL_BRP_BASEURL };
const bsn = new Bsn('999993653');

runLiveTests('Getting name from BRP', () => {
  test('Creation api instance', async() => {
    expect(new BRPApi(config)).toBeTruthy();
  });


  test('Get user fullname from API', async() => {
    const api = new BRPApi(config);
    expect(await api.getName(bsn)).toBe('Suzanne Moulin');
  });
});
