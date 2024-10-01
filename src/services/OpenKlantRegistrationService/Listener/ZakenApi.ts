import { Rol, RolSchema } from './model/Rol';
import { ZgwApi, ZgwApiProps } from './ZgwApi';

export interface IZakenApi {
  getRol(url: string) : Promise<Rol>;
}

export class ZakenApi extends ZgwApi implements IZakenApi {

  constructor(props: ZgwApiProps) {
    super(props);
  }

  async getRol(url: string) : Promise<Rol> {
    const response = await this.get(url);
    const result = await response.json();
    return RolSchema.parse(result);
  }

}

export class ZakenApiMock implements IZakenApi {
  async getRol(_url: string): Promise<Rol> {
    throw Error('This method should be mocked!');
  }
}
