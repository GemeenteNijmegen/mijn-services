import { OpenKlantPartij } from '../../Shared/model/Partij';


test('persoon partij', () => {
  const persoon: OpenKlantPartij = {
    digitaleAdressen: [],
    indicatieActief: true,
    indicatieGeheimhouding: true,
    rekeningnummers: [],
    soortPartij: 'persoon',
    voorkeursDigitaalAdres: null,
    voorkeursRekeningnummer: null,
    voorkeurstaal: 'dut',
    partijIdentificatie: {
      contactnaam: {
        voornaam: 'abc',
        achternaam: 'abc',
      },
      volledigeNaam: 'abc',
    },
  };
  expect(persoon).toBeTruthy();
  expect((persoon.partijIdentificatie as any).volledigeNaam).toBe('abc');
});

test('organisatie partij', () => {
  const persoon: OpenKlantPartij = {
    digitaleAdressen: [],
    indicatieActief: true,
    indicatieGeheimhouding: true,
    rekeningnummers: [],
    soortPartij: 'persoon',
    voorkeursDigitaalAdres: null,
    voorkeursRekeningnummer: null,
    voorkeurstaal: 'dut',
    partijIdentificatie: {
      naam: 'abc',
    },
  };
  expect(persoon).toBeTruthy();
});