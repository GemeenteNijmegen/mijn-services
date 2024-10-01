import * as jwt from 'jsonwebtoken';
import { Rol } from './model/Rol';

interface ZakenApiProps {
  clientId: string;
  clientSecret: string;
}

export interface IZakenApi {
  getRol(url: string) : Promise<Rol>;
}

export class ZakenApi implements IZakenApi {

  private readonly props: ZakenApiProps;
  constructor(props: ZakenApiProps) {
    this.props = props;
  }

  async getRol(url: string) : Promise<Rol> {

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
    }, this.props.clientSecret, {
      algorithm: 'HS256',
    });
    return token;
  }
}

export class ZakenApiMock implements IZakenApi {
  async getRol(_url: string): Promise<Rol> {
    throw Error('This method should be mocked!');
  }
}
