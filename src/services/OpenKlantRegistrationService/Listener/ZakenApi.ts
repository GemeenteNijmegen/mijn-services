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

  async updateRol(rol: Partial<Rol>) : Promise<Rol> {
    if (!rol.url) {
      throw Error('Cannot update a rol without URL');
    }
    const response = await this.patch(rol.url, {
      body: JSON.stringify(rol),
    });
    const result = await response.json();
    return RolSchema.parse(result);
  }

}

export class ZakenApiMock implements IZakenApi {
  async getRol(_url: string): Promise<Rol> {
    throw Error('This method should be mocked!');
  }
  async updateRol(_url: string, _rol: Partial<Rol>): Promise<Rol> {
    throw Error('This method should be mocked!');
  }
}
