import { OpenKlantDigitaalAdres, OpenKlantDigitaalAdresSchemaWithUuid, OpenKlantDigitaalAdresWithUuid, OpenKlantPartij, OpenKlantPartijIdentificiatie, OpenKlantPartijIdentificiatieSchemaWithUuid, OpenKlantPartijIdentificiatieWithUuid, OpenKlantPartijSchemaWithUuid, OpenKlantPartijWithUuid } from './model/Partij';

interface OpenKlantApiProps {
  url: string;
  apikey: string;
}

export interface IOpenKlantApi {
  registerPartij(partij: OpenKlantPartij) : Promise<OpenKlantPartijWithUuid>;
  updatePartij(partij: Partial<OpenKlantPartijWithUuid>) : Promise<OpenKlantPartijWithUuid>;
  addPartijIdentificatie(identificatie: OpenKlantPartijIdentificiatie): Promise<OpenKlantPartijIdentificiatieWithUuid>;
  addDigitaalAdres(address: OpenKlantDigitaalAdres) : Promise<OpenKlantDigitaalAdresWithUuid>;
  getEndpoint(): string;
}

export class OpenKlantApi implements IOpenKlantApi {

  private readonly props: OpenKlantApiProps;
  constructor(props: OpenKlantApiProps) {
    this.props = props;
  }

  async addDigitaalAdres(address: OpenKlantDigitaalAdres): Promise<OpenKlantDigitaalAdresWithUuid> {
    const url = this.props.url + '/digitaleadressen';
    const response = await this.callApi('POST', url, {
      body: JSON.stringify(address),
    });
    const result = await response.json();
    return OpenKlantDigitaalAdresSchemaWithUuid.parse(result);
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

  private async callApi(method: string, url: string, options: RequestInit) {
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
        console.error('Request failed for url', response.status, await response.text());
        throw Error('Request failed');
      }
      return response;
    } catch (error) {
      console.error(error);
      throw Error('OpenKlantApi request failed');
    }

  }

}


export class OpenKlantApiMock implements IOpenKlantApi {
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
