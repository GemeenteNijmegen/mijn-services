import { ErrorResponse } from './ErrorResponse';
import { logger } from './Logger';
import { OpenKlantDigitaalAdres, OpenKlantDigitaalAdresSchemaWithUuid, OpenKlantDigitaalAdresWithUuid, OpenKlantPartij, OpenKlantPartijenWithUuid, OpenKlantPartijenWithUuidSchema, OpenKlantPartijIdentificiatie, OpenKlantPartijIdentificiatieSchemaWithUuid, OpenKlantPartijIdentificiatieWithUuid, OpenKlantPartijSchemaWithUuid, OpenKlantPartijWithUuid } from './model/Partij';
import { StrategyStatics } from './strategies/StrategyStatics';

interface OpenKlantApiProps {
  url: string;
  apikey: string;
}

export interface IOpenKlantApi {
  findPartij(id: string | undefined | null, type: 'organisatie' | 'contactpersoon' | 'persoon') : Promise<OpenKlantPartijWithUuid | undefined>;
  findPartijen(id: string | undefined | null, type: 'organisatie' | 'contactpersoon' | 'persoon') : Promise<OpenKlantPartijenWithUuid>;
  registerPartij(partij: OpenKlantPartij) : Promise<OpenKlantPartijWithUuid>;
  updatePartij(partij: Partial<OpenKlantPartijWithUuid>) : Promise<OpenKlantPartijWithUuid>;
  addPartijIdentificatie(identificatie: OpenKlantPartijIdentificiatie): Promise<OpenKlantPartijIdentificiatieWithUuid>;
  addDigitaalAdres(address: OpenKlantDigitaalAdres) : Promise<OpenKlantDigitaalAdresWithUuid>;
  deleteDigitaalAdres(uuid: string) : Promise<boolean>;
  getEndpoint(): string;
}

export class OpenKlantApi implements IOpenKlantApi {

  private readonly props: OpenKlantApiProps;
  constructor(props: OpenKlantApiProps) {
    this.props = props;
  }

  async findPartij(id: string | undefined | null, partijSoort: 'organisatie' | 'contactpersoon' | 'persoon'): Promise<OpenKlantPartijWithUuid | undefined> {
    const partijen = await this.findPartijen(id, partijSoort);
    if (partijen.count == 0) {
      return undefined;
    }
    return OpenKlantPartijSchemaWithUuid.parse(partijen.results[0]);
  }

  async findPartijen(id: string | undefined | null, partijSoort: 'organisatie' | 'contactpersoon' | 'persoon'): Promise<OpenKlantPartijenWithUuid> {
    if (!id) {
      throw new ErrorResponse(400, 'Partij identifier is undefined, cannot search for a partij');
    }

    let url = this.props.url + '/partijen';
    if (partijSoort == 'organisatie') {
      url += '?partijIdentificator__codeRegister=KVK';
    } else if (partijSoort == 'persoon') {
      url += '?partijIdentificator__codeRegister=BRP';
    } else if (partijSoort == 'contactpersoon') {
      url += `?partijIdentificator__codeRegister=${StrategyStatics.PSUEDOID_REGISTER}`;
    } else {
      throw Error('Unknonw partijSoort to query: ' + partijSoort);
    }

    url += `&partijIdentificator__objectId=${id}`;
    url += '&expand=digitaleAdressen';

    const response = await this.callApi('GET', url);
    const result = await response.json() as any;
    return OpenKlantPartijenWithUuidSchema.parse(result);
  }

  async addDigitaalAdres(address: OpenKlantDigitaalAdres): Promise<OpenKlantDigitaalAdresWithUuid> {
    const url = this.props.url + '/digitaleadressen';
    const response = await this.callApi('POST', url, {
      body: JSON.stringify(address),
    });
    const result = await response.json();
    return OpenKlantDigitaalAdresSchemaWithUuid.parse(result);
  }

  async deleteDigitaalAdres(uuid: string) {
    const url = this.props.url + `/digitaleadressen/${uuid}`;
    const response = await this.callApi('DELETE', url);
    return response.ok;
  }

  async addPartijIdentificatie(identificatie: OpenKlantPartijIdentificiatie): Promise<OpenKlantPartijIdentificiatieWithUuid> {
    const url =this.props.url + '/partij-identificatoren';
    const response = await this.callApi('POST', url, {
      body: JSON.stringify(identificatie),
    });
    const result = await response.json();
    return OpenKlantPartijIdentificiatieSchemaWithUuid.parse(result);
  }

  async registerPartij(partij: OpenKlantPartij): Promise<OpenKlantPartijWithUuid> {
    const url = this.props.url + '/partijen';
    const response = await this.callApi('POST', url, {
      body: JSON.stringify(partij),
    });
    const result = await response.json();
    return OpenKlantPartijSchemaWithUuid.parse(result);

  }

  async updatePartij(partij: Partial<OpenKlantPartijWithUuid>) {
    if (!partij.uuid) {
      throw Error('Cannot update partij when uuid is not provided');
    }
    const url = this.props.url + `/partijen/${partij.uuid}`;
    const response = await this.callApi('PATCH', url, {
      body: JSON.stringify(partij),
    });
    const result = await response.json();
    return OpenKlantPartijSchemaWithUuid.parse(result);
  }

  getEndpoint() {
    return this.props.url;
  }

  constructEndpoint(path: string) {
    if (path.startsWith('/')) {
      return this.props.url + path;
    }
    return this.props.url + '/' + path;
  }

  private async callApi(method: string, url: string, options?: RequestInit) {
    try {
      const response = await fetch(url, {
        method: method,
        headers: {
          'Authorization': `Token ${this.props.apikey}`,
          'Content-Type': 'application/json',
        },
        ...options,
      });

      if (!response.ok) {
        const responseBody = await response.text();
        const statusCode = response.status.toString();
        logger.error('Request failed for url', {statusCode, response: responseBody});
        throw Error('Request failed');
      }
      return response;
    } catch (error) {
      logger.error('OpenKlant API call failed', error as Error);
      throw Error('OpenKlantApi request failed');
    }

  }

}


export class OpenKlantApiMock implements IOpenKlantApi {
  deleteDigitaalAdres(_uuid: string): Promise<boolean> {
    throw new Error('Method should be mocked.');
  }
  findPartijen(_id: string | undefined | null, _type: 'organisatie' | 'contactpersoon' | 'persoon'): Promise<OpenKlantPartijenWithUuid> {
    throw new Error('Method should be mocked.');
  }
  findPartij(_id: string | undefined | null, _type: 'organisatie' | 'contactpersoon' | 'persoon'): Promise<OpenKlantPartijWithUuid| undefined> {
    throw new Error('Method should be mocked.');
  }
  getEndpoint(): string {
    throw new Error('Method should be mocked.');
  }
  registerPartij(_partij: OpenKlantPartij): Promise<OpenKlantPartijWithUuid> {
    throw new Error('Method should be mocked.');
  }
  updatePartij(_partij: Partial<OpenKlantPartijWithUuid>): Promise<OpenKlantPartijWithUuid> {
    throw new Error('Method should be mocked.');
  }
  addPartijIdentificatie(_identificatie: OpenKlantPartijIdentificiatie): Promise<OpenKlantPartijIdentificiatieWithUuid> {
    throw new Error('Method should be mocked.');
  }
  addDigitaalAdres(_address: OpenKlantDigitaalAdres): Promise<OpenKlantDigitaalAdresWithUuid> {
    throw new Error('Method should be mocked.');
  }
}
