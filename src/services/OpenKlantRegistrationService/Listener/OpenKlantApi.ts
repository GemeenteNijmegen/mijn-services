import { OpenKlantDigitaalAdres, OpenKlantDigitaalAdresSchemaWithUuid, OpenKlantDigitaalAdresWithUuid, OpenKlantPartij, OpenKlantPartijIdentificiatie, OpenKlantPartijIdentificiatieSchemaWithUuid, OpenKlantPartijIdentificiatieWithUuid, OpenKlantPartijSchemaWithUuid, OpenKlantPartijWithUuid } from './model/Partij';

interface OpenKlantApiProps {
  url: string;
  apikey: string;
}

export interface IOpenKlantApi {
  registerPartij(partij: OpenKlantPartij) : Promise<OpenKlantPartijWithUuid>;
  addPartijIdentificatie(identificatie: OpenKlantPartijIdentificiatie): Promise<OpenKlantPartijIdentificiatieWithUuid>;
  addDigitaalAdres(address: OpenKlantDigitaalAdres) : Promise<OpenKlantDigitaalAdresWithUuid>;
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
    const url =this.props.url + '/partijen';
    const response = await this.callApi('POST', url, {
      body: JSON.stringify(partij),
    });
    const result = await response.json();
    return OpenKlantPartijSchemaWithUuid.parse(result);

  }

  private async callApi(method: string, url: string, options: RequestInit) {

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
  }

}

export class OpenKlantApiMock implements IOpenKlantApi {
  addDigitaalAdres(_address: OpenKlantDigitaalAdres): Promise<OpenKlantDigitaalAdresWithUuid> {
    throw new Error('This method should be mocked.');
  }
  addPartijIdentificatie(_identificatie: OpenKlantPartijIdentificiatie): Promise<OpenKlantPartijIdentificiatieWithUuid> {
    throw new Error('This method should be mocked.');
  }
  async registerPartij(_partij: OpenKlantPartij): Promise<OpenKlantPartijWithUuid> {
    throw Error('This method should be mocked.');
  }
}