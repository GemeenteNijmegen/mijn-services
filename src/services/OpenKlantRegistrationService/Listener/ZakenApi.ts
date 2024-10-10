import { Rol, RolSchema } from './model/Rol';
import { ZgwApi, ZgwApiProps } from './ZgwApi';

export interface IZakenApi {
  getRol(url: string) : Promise<Rol>;
  updateRol(rol: Rol) : Promise<Rol>;
}

export interface ZakenApiProps extends ZgwApiProps {
  zakenApiUrl: string;
}

export class ZakenApi extends ZgwApi implements IZakenApi {

  private zakenApiUrl: string;
  constructor(props: ZakenApiProps) {
    super(props);
    this.zakenApiUrl = props.zakenApiUrl;
  }

  async getRol(url: string) : Promise<Rol> {
    const response = await this.get(url);
    const result = await response.json();
    return RolSchema.parse(result);
  }

  async updateRol(rol: Rol) : Promise<Rol> {
    if (!rol.url) {
      throw Error('Cannot update a rol without URL');
    }

    const originalRol = await this.getRol(rol.url);

    try {
      await this.delete(rol.url);
      await this.post(this.zakenApiUrl + '/zaken/api/v1/rollen', {
        body: JSON.stringify({
          rol,
          url: undefined,
        }),
      });
    } catch (error) {
      console.error('Failed to delete and recreate rol! This is the original role:', originalRol);
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
  async updateRol(_rol: Rol): Promise<Rol> {
    throw Error('This method should be mocked!');
  }
}
