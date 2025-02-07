import { randomUUID } from 'crypto';
import { Rol } from '../../Shared/model/Rol';
import { OpenKlantMapper } from '../OpenKlantMapper';


test('Partij from persoon with email and phone', () => {
  const rol = getRol();
  const partij = OpenKlantMapper.partijFromRol(rol);
  expect((partij.partijIdentificatie as any).volledigeNaam).toBe('H. de Jong');
});

test('Digitale adressen from persoon with email and phone', () => {
  const rol = getRol();
  const adrressen = OpenKlantMapper.digitaalAdressenFromRol(rol, randomUUID());
  expect(adrressen).toHaveLength(2);
  expect(adrressen[0].soortDigitaalAdres).toBe(OpenKlantMapper.EMAIL);
  expect(adrressen[1].soortDigitaalAdres).toBe(OpenKlantMapper.TELEFOONNUMMER);
});

test('Partij identificatie from rol', () => {
  const rol = getRol();
  const identificatie = OpenKlantMapper.partijIdentificatieFromRol(rol, randomUUID());
  expect(identificatie.partijIdentificator?.objectId).toBe('900000999');
});

function getRol() {
  const rolUuid = randomUUID();
  const rol: Rol = {
    uuid: rolUuid,
    url: 'https://example.com/zaken/rollen/' + rolUuid,
    roltype: 'https://example.com/catalogi/roltype/' + rolUuid,
    zaak: 'https://example.com/zaken/zaken/' + rolUuid,
    contactpersoonRol: {
      naam: 'H. de Jong',
      emailadres: 'h.de.jong@example.com',
      telefoonnummer: '0612341234',
    },
    betrokkeneIdentificatie: {
      inpBsn: '900000999',
    },
    betrokkeneType: 'natuurlijk_persoon',
  };
  return rol;
}