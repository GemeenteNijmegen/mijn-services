import { randomUUID } from 'crypto';
import { OpenKlantMapper } from '../model/Partij';
import { Rol } from '../model/Rol';


test('Partij from persoon with email and phone', () => {
  const rol = getRol();
  const partij = OpenKlantMapper.partijFromRol(rol);
  console.log(partij);
});

test('Digitale adressne from persoon with email and phone', () => {
  const rol = getRol();
  const adrressen = OpenKlantMapper.digitaalAdressenFromRol(rol);
  expect(adrressen).toHaveLength(2);
  console.log(adrressen);
});

test('Partij identificaties from persoon with email and phone', () => {
  const rol = getRol();
  const ids = OpenKlantMapper.partijIdentificatiesFromRol(rol);
  console.log(ids);
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