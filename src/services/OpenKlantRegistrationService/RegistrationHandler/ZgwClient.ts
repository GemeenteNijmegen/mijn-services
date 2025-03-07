import { AWS, Bsn } from '@gemeentenijmegen/utils';
import * as jwt from 'jsonwebtoken';
import { logger } from '../Shared/Logger';

interface ZgwClientOptions {
  /**
   * @default - fetched from environment variable ZGW_CLIENT_ID when init is called
   */
  clientId?: string;

  /**
   * @default - fetch from secretsmanager using the arn provided in ZGW_CLIENT_SERCET_ARN when init is called
   */
  clientSecret?: string;

  /**
   * Name used to identify this application
   */
  name: string;

  /**
   * Zaken API url to send submissions to
   */
  zakenApiUrl: string;

  /**
   * Zaaktype url for the zaak to create
   */
  zaaktype: string;

  /**
   * Roltype url for the zaak to create for natural persons
   */
  roltype: string;

  /**
   * Zaakstatus url for the zaak to create
   */
  zaakstatus: string;

  /**
   * RSIN of the organization
   * @default - RSIN of Gemeente Nijmegen
   */
  rsin?: string;
}

interface Contactpersoon {
  emailadres?: string;
  functie?: string;
  telefoonnummer?: string;
  naam: string;
}

export class ZgwClient {

  public static readonly GN_RSIN = '001479179';

  private clientId?: string;
  private clientSecret?: string;
  private readonly options: ZgwClientOptions;

  constructor(options: ZgwClientOptions) {
    this.options = options;
    this.clientId = options.clientId;
    this.clientSecret = options.clientSecret;
  }

  async init() {
    if (this.clientId && this.clientSecret) {
      return;
    }
    this.clientId = process.env.ZGW_CLIENT_ID;
    this.clientSecret = await AWS.getSecret(process.env.ZGW_CLIENT_SECRET_ARN!);
  }

  async getZaak(identificatie: string) {
    const zaken = await this.callZaakApi('GET', `zaken?identificatie=${identificatie}`);
    if (!zaken || zaken.count == 0) {
      throw new ZaakNotFoundError();
    } else if (zaken.count > 1) {
      throw Error('Multiple zaken found');
    }
    return zaken.results[0];
  }

  async createZaak(identificatie: string, formulier: string) {
    const zaakRequest = {
      identificatie: identificatie,
      bronorganisatie: this.options.rsin ?? ZgwClient.GN_RSIN,
      zaaktype: this.options.zaaktype,
      verantwoordelijkeOrganisatie: this.options.rsin ?? ZgwClient.GN_RSIN,
      startdatum: this.datestemp(),
      omschrijving: `Webformulier ${identificatie}`,
      toelichting: `Webformulier ${formulier}`,
    };
    const zaak = await this.callZaakApi('POST', 'zaken', zaakRequest);
    return zaak;
  }

  async addStatusToZaak(zaak: string, description: string) {
    const statusRequest = {
      zaak: zaak,
      statustype: this.options.zaakstatus,
      datumStatusGezet: this.datestemp(),
      statustoelichting: description,
    };
    const status = await this.callZaakApi('POST', 'statussen', statusRequest);
    return status;
  }

  async addBsnRoleToZaak(zaak: string, bsn: Bsn, contactpersoon: Contactpersoon) {
    const roleRequest = {
      zaak,
      betrokkeneType: 'natuurlijk_persoon',
      roltype: this.options.roltype,
      roltoelichting: 'initiator',
      contactpersoonRol: contactpersoon,
      betrokkeneIdentificatie: {
        inpBsn: bsn.bsn,
      },
    };
    await this.callZaakApi('POST', 'rollen', roleRequest);
  }

  async addKvkRoleToZaak(zaak: string, kvk: string, bedrijfsnaam: string, contactpersoon: Contactpersoon) {
    const roleRequest = {
      zaak,
      betrokkeneType: 'niet_natuurlijk_persoon',
      roltype: this.options.roltype,
      roltoelichting: 'aanvrager',
      contactpersoonRol: contactpersoon,
      betrokkeneIdentificatie: {
        annIdentificatie: kvk,
        statutaireNaam: bedrijfsnaam,
      },
    };
    await this.callZaakApi('POST', 'rollen', roleRequest);
  }


  private createToken(clientId: string, userId: string, secret: string) {
    const token = jwt.sign({
      iss: clientId,
      iat: Date.now(),
      client_id: clientId,
      user_id: userId,
      user_representation: userId,
    }, secret);
    return token;
  }

  private async callZaakApi(method: string, path: string, data?: any) {
    this.checkConfiguration();
    const token = this.createToken(this.clientId!, this.options.name, this.clientSecret!);

    const url = this.joinUrl(this.options.zakenApiUrl, path);
    const response = await fetch(url, {
      method: method,
      body: JSON.stringify(data),
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-type': 'application/json',
        'Content-Crs': 'EPSG:4326',
        'Accept-Crs': 'EPSG:4326',
      },
    });
    const json = await response.json() as any;
    logger.debug('Response', { json });
    if (response.status < 200 || response.status > 300) {
      console.debug(json);
      throw Error(`Not a 2xx response: ${response.status} ${response.statusText}`);
    }
    return json;
  }

  private checkConfiguration() {
    if (!this.clientId || !this.clientSecret) {
      throw Error('ZgwClient is not configured correctly!');
    }
  }

  private datestemp() {
    return new Date().toISOString().substring(0, 'yyyy-mm-dd'.length);
  }

  private joinUrl(start: string, ...args: string[]) {
    if (!start.endsWith('/')) {
      start = `${start}/`;
    }
    return start + args.map(pathPart => pathPart.replace(/(^\/|\/$)/g, '')).join('/');
  }


}


export class ZaakNotFoundError extends Error { }
