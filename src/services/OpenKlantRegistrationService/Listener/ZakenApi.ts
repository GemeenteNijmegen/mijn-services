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

  /**
   * WARNING: THIS CANNOT BE USED IN PRODUCTION AS THIS IS NOT AN ACTUAL
   * PATCH BUT A DELETE & POST REQUEST.
   * @param rol
   * @returns
   */
  async updateRol(rol: Rol) : Promise<Rol> {
    if (!rol.url) {
      throw Error('Cannot update a rol without URL');
    }

    // TODO fix and remove this after fixing
    console.warn('THIS CANNOT BE USED IN PRODUCTION AS THIS IS NOT AN ACTUAL PATCH BUT A DELETE & POST REQUEST.');

    const originalRol = await this.getRol(rol.url);
    try {
      console.debug('Updating rol');

      const response = await this.post(this.zakenApiUrl + '/rollen', {
        body: JSON.stringify({
          ...rol,
          url: undefined,
          uuid: undefined,
          registratiedatum: undefined,
        }),
      });

      // Remove the old role if the POST was 2XX
      if (response.ok) {
        await this.delete(rol.url);
      }

      const result = await response.json();
      return RolSchema.parse(result);
    } catch (error) {
      console.error('Failed to delete and recreate rol! This is the original role:', originalRol);
      throw Error('Could not update rol');
    }

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
