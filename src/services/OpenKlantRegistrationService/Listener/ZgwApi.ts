import * as jwt from 'jsonwebtoken';

export interface ZgwApiProps {
  clientId: string;
  clientSecret: string;
}

export abstract class ZgwApi {

  private readonly props: ZgwApiProps;
  constructor(props: ZgwApiProps) {
    this.props = props;
  }

  protected get(url: string, options?: RequestInit) {
    return this.callApi('GET', url, options);
  }

  protected post(url: string, options?: RequestInit) {
    return this.callApi('POST', url, options);
  }

  protected delete(url: string, options?: RequestInit) {
    return this.callApi('DELETE', url, options);
  }

  private async callApi(method: string, url: string, options?: RequestInit) {
    const response = await fetch(url, {
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.createToken()}`,
      },
      ...options,
    });

    if (!response.ok) {
      console.log('Get failed for', url, response.status, response.statusText);
      throw new Error('Request failed');
    }
    return response;
  }

  protected createToken() {
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