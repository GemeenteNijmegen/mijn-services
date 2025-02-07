import { validateNotification } from "../receiver.lambda";

test('validateNotifications', async () => {
  process.env.ZAKEN_URL = 'https://zaak';
  const ignoreReasons = validateNotification({
    kanaal: 'zaken',
    actie: 'create',
    resource: 'rol',
    aanmaakdatum: '',
    hoofdObject: 'https://zaak/zaakuuid',
    resourceUrl: "https://rol/roluuid"
  });
  expect(ignoreReasons).toBeUndefined()
});

test('Ignore notification different url', async () => {
  process.env.ZAKEN_URL = 'https://zaak';
  const ignoreReasons = validateNotification({
    kanaal: 'zaken',
    actie: 'create',
    resource: 'rol',
    aanmaakdatum: '',
    hoofdObject: 'https://differenturl/zaakuuid',
    resourceUrl: "https://rol/roluuid"
  });
  expect(ignoreReasons).not.toBeUndefined();
});

test('Ignore notification differnt resource', async () => {
  process.env.ZAKEN_URL = 'https://zaak';
  const ignoreReasons = validateNotification({
    kanaal: 'zaken',
    actie: 'create',
    resource: 'zaak',
    aanmaakdatum: '',
    hoofdObject: 'https://zaak/zaakuuid',
    resourceUrl: "https://rol/roluuid"
  });
  expect(ignoreReasons).not.toBeUndefined();
})