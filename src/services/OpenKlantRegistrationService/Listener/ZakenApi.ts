import * as jwt from 'jsonwebtoken';

interface ZakenApiProps {
  clientId: string;
  clientSecret: string;
}

export interface IZakenApi {
  get(url: string) : Promise<any>;
}

export class ZakenApi implements IZakenApi {

  private readonly props: ZakenApiProps;
  constructor(props: ZakenApiProps) {
    this.props = props;
  }

  async get(url: string) : Promise<any> {

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.createToken()}`,
      },
    });

    if (!response.ok) {
      console.log('Get failed for', url, response.status, response.statusText);
      throw Error('Request failed');
    }

    const result = await response.json();
    return result as any;
  }

  private createToken() {
    const token = jwt.sign({
      iss: this.props.clientId,
      iat: Date.now(),
      client_id: this.props.clientId,
      user_id: this.props.clientId,
      user_representation: this.props.clientId,
    }, this.props.clientSecret);
    return token;
  }
}