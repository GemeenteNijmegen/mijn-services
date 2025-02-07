import { Bsn } from '@gemeentenijmegen/utils';
import { logger } from '../Shared/Logger';

interface Config {
  apiKey: string;
  baseUrl: string;
}

type fields =
  'aNummer' |
  'adressering' |
  'burgerservicenummer' |
  'datumEersteInschrijvingGBA' |
  'datumInschrijvingInGemeente' |
  'europeesKiesrecht' |
  'geboorte' |
  'gemeenteVanInschrijving' |
  'geslacht' |
  'gezag' |
  'immigratie' |
  'indicatieCurateleRegister' |
  'indicatieGezagMinderjarige' |
  'kinderen' |
  'leeftijd' |
  'naam' |
  'nationaliteiten' |
  'ouders' |
  'overlijden' |
  'partners' |
  'uitsluitingKiesrecht' |
  'verblijfplaats.verblijfadres' |
  'verblijfstitel' |
  'verblijfplaatsBinnenland' |
  'adresseringBinnenland';

interface requestConfiguration {
  endpoint: 'personen';
  type: 'RaadpleegMetBurgerservicenummer';
  fields: fields[];
  burgerservicenummer: Bsn[];
}

export class BRPApi {

  constructor(private config: Config) {
  }

  async getName(bsn: Bsn) {
    const response = await this.request({
      endpoint: 'personen',
      type: 'RaadpleegMetBurgerservicenummer',
      burgerservicenummer: [bsn],
      fields: ['naam'],
    });
    if (!response?.personen || response.personen.length > 1) {
      throw Error('Multiple results for single BSN');
    }
    return response.personen[0].naam.volledigeNaam;
  }

  async request(requestConfiguration: requestConfiguration): Promise<any> {
    const url = `${this.config.baseUrl}/${requestConfiguration.endpoint}`;
    const body = JSON.stringify({
      type: requestConfiguration.type,
      fields: requestConfiguration.fields,
      burgerservicenummer: requestConfiguration.burgerservicenummer.map(bsn => bsn.bsn),
    });
    logger.debug(url, body);
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'X-API-KEY': this.config.apiKey,
        'Content-Type': 'application/json',
      },
      body,
    });
    if (!response.ok) {
      logger.error('[HAAL CENTRAAL BRP] request failed', response.status?.toString());
      throw Error('Request failed');
    }
    return response.json();
  } catch(error: any) {
    logger.error(error);
    throw Error('Haal Centraal request failed');
  }
}
