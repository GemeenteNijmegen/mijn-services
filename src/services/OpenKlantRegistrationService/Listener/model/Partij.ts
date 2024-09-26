import { z } from 'zod';
import { Rol } from './Rol';

const uuidSchema = z.object({ uuid: z.string() });

export const OpenKlantPartijSchema = z.object({
  digitaleAdressen: z.array(uuidSchema),
  voorkeursDigitaalAdres: z.union([z.null(), uuidSchema]),
  rekeningnummers: z.array(uuidSchema),
  voorkeursRekeningnummer: z.union([z.null(), uuidSchema]),
  soortPartij: z.enum([
    'persoon',
    'organisatie',
    'contactpersoon',
  ]),
  indicatieActief: z.boolean({
    description: 'Geeft aan of de contactgegevens van de partij nog gebruikt morgen worden om contact op te nemen. Gegevens van niet-actieve partijen mogen hiervoor niet worden gebruikt.',
  }),
  voorkeurstaal: z.string(),
  partijIdentificatie: z.object({ // Staat niet in de docs maar is wel nodig?
    // contactnaam: { // TODO figure out if we need this?
    //   voorletters: 'H',
    //   voornaam: 'Hans',
    //   voorvoegselAchternaam: 'de',
    //   achternaam: 'Jong',
    // },
    volledigeNaam: z.string(),
  }),
});

type OpenKlantPartijType = z.infer<typeof OpenKlantPartijSchema>;

export class OpenKlantPartij {

  static from(rol: Rol) : OpenKlantPartij {

    if (process.env.DEBUG) {
      console.debug('Mapping rol to partij', rol);
    }

    const partij = new OpenKlantPartij;
    partij.data = {
      digitaleAdressen: [],
      indicatieActief: true,
      partijIdentificatie: {
        volledigeNaam: '',
      },
      rekeningnummers: [],
      soortPartij: 'persoon',
      voorkeursDigitaalAdres: null,
      voorkeursRekeningnummer: null,
      voorkeurstaal: 'dut',
    } as OpenKlantPartijType;
    return partij;
  }

  data: OpenKlantPartijType | undefined = undefined;

  private constructor() {};


}


