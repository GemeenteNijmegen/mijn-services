import { OpenKlantPartij } from './model/Partij';

interface OpenKlantApiProps {
  url: string;
  apikey: string;
}

export interface IOpenKlantApi {
  registerPartijGegevens(url: string) : Promise<any>;
}

export class OpenKlantApi implements IOpenKlantApi {

  private readonly props: OpenKlantApiProps;
  constructor(props: OpenKlantApiProps) {
    this.props = props;
  }
  registerPartijGegevens(_url: string): Promise<any> {
    console.log(this.props);
    throw new Error('Method not implemented.');
  }

  async getPartij(_identificatie: string, _type: string) {
    throw new Error('Method not implemented.');
  }

  async postPartij(_partij: OpenKlantPartij) : Promise<any> {
    throw new Error('Method not implemented.');
    // const response = await fetch(this.props.url, {
    //   headers: {
    //     Authorization: `Token ${this.props.apikey}`,
    //   },
    // });

    // if (!response.ok) {
    //   console.log('Get failed for', url, response.status, response.statusText);
    //   throw Error('Request failed');
    // }

    // const result = await response.json();
    // return result as any;
  }

  async putPartij(_partij: OpenKlantPartij) : Promise<any> {
    throw new Error('Method not implemented.');
  }

  async createPartijIdentificatie(_partijUrl: string) {
    throw new Error('Method not implemented.');
  }

  async createDigitaalAdres(_partijUrl: string) {
    throw new Error('Method not implemented.');
  }

}

export class OpenKlantApiMock implements IOpenKlantApi {
  async registerPartijGegevens(_url: string): Promise<any> {
    return {
      roltype: 'https://example.com/open-klant/000-000-000-000',
    };
  }
}