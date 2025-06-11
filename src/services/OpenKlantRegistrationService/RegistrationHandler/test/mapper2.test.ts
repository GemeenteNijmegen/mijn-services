import { RolSchema } from "../../Shared/model/Rol";
import { OpenKlantMapper } from "../OpenKlantMapper";



test('Rol zonder naam in contactpersoonRol', () => {

  const rol = {
    "url": "https://example.com/zaken/api/v1/rollen/xxx-xxx-xxx-xxx",
    "uuid": "xxx-xxx-xxx-xxx",
    "zaak": "https://example.com/zaken/api/v1/zaken/xxx-xxx-xxx-xxx",
    "betrokkene": "",
    "betrokkeneType": "natuurlijk_persoon",
    "afwijkendeNaamBetrokkene": "",
    "roltype": "https://example.com/catalogi/api/v1/roltypen/xxx-xxx-xxx-xxx",
    "omschrijving": "Aanvrager",
    "omschrijvingGeneriek": "initiator",
    "roltoelichting": "Aanvrager",
    "registratiedatum": "2025-06-11T14:00:37.490162Z",
    "indicatieMachtiging": "",
    "contactpersoonRol": {
      "emailadres": "",
      "functie": "",
      "telefoonnummer": "",
      "naam": ""
    },
    "statussen": [],
    "betrokkeneIdentificatie": {
      "anpIdentificatie": "",
      "inpA_nummer": "",
      "geslachtsnaam": "Geslachtsnaam",
      "voorvoegselGeslachtsnaam": "",
      "voorletters": "",
      "voornamen": "Voornaam Voornaam",
      "geslachtsaanduiding": "m",
      "geboortedatum": "",
      "verblijfsadres": null,
      "subVerblijfBuitenland": null
    }
  }

  const realRol = RolSchema.parse(rol);
  const partij = OpenKlantMapper.persoonPartijFromRol(realRol);
  expect(partij).not.toBeUndefined();

})