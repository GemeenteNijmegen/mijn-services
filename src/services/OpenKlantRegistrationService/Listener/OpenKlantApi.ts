import { OpenKlantDigitaalAdres, OpenKlantDigitaalAdresWithUuid, OpenKlantPartij, OpenKlantPartijIdentificiatie, OpenKlantPartijIdentificiatieWithUuid, OpenKlantPartijWithUuid } from './model/Partij';

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

    const response = await fetch(url, {
      method: 'POST',
      body: JSON.stringify(address),
      headers: {
        Authorization: `Token ${this.props.apikey}`,
      },
    });

    if (!response.ok) {
      console.error('Request failed for url', response.status);
      throw Error('Request failed');
    }

    // TODO fix types
    const created = await response.json() as any;
    return created;

  }

  async addPartijIdentificatie(identificatie: OpenKlantPartijIdentificiatie): Promise<OpenKlantPartijIdentificiatieWithUuid> {
    const url =this.props.url + '/partij-identificatoren';

    const response = await fetch(url, {
      method: 'POST',
      body: JSON.stringify(identificatie),
      headers: {
        Authorization: `Token ${this.props.apikey}`,
      },
    });

    if (!response.ok) {
      console.error('Request failed for url', response.status);
      throw Error('Request failed');
    }

    // TODO fix types
    const created = await response.json() as any;
    return created;

  }

  async registerPartij(partij: OpenKlantPartij): Promise<OpenKlantPartijWithUuid> {

    const url =this.props.url + '/partijen';
    const response = await fetch(url, {
      method: 'POST',
      body: JSON.stringify(partij),
      headers: {
        Authorization: `Token ${this.props.apikey}`,
      },
    });

    if (!response.ok) {
      console.error('Request failed for url', response.status);
      throw Error('Request failed');
    }

    // TODO fix types
    const created = await response.json() as any;
    return created;

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