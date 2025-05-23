import * as jwt from 'jsonwebtoken';
import { logger } from '../Shared/Logger';

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

  protected patch(url: string, options?: RequestInit) {
    return this.callApi('PATCH', url, options);
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
        'Accept-Crs': 'EPSG:4326',
      },
      ...options,
    });

    if (!response.ok) {
      if (response.status == 404) {
        throw new NotFoundError();
      }
      logger.error(`[ZGW] ${method} failed for ${url}`, {
        status: response.status,
        statusText: response.statusText,
        response: await response.text(),
      });
      throw new Error(method + ' request failed');
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

export class NotFoundError extends Error { }
