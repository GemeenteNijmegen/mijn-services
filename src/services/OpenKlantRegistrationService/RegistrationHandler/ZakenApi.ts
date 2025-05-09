import { logger } from '../Shared/Logger';
import { Rol, RolSchema } from '../Shared/model/Rol';
import { ZgwApi, ZgwApiProps } from './ZgwApi';

export interface IZakenApi {
  getRol(url: string): Promise<Rol>;
  updateRol(rol: Rol): Promise<Rol>;
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

  async getRol(url: string): Promise<Rol> {
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
  async updateRol(rol: Rol): Promise<Rol> {
    if (!rol.url) {
      throw Error('Cannot update a rol without URL');
    }

    const originalRol = await this.getRol(rol.url);
    try {
      logger.debug('Updating rol');
      await this.delete(rol.url);
      const response = await this.post(this.zakenApiUrl + '/rollen', {
        body: JSON.stringify({
          ...rol,
          url: undefined,
          uuid: undefined,
          registratiedatum: undefined,
        }),
      });

      const json = await response.json();

      // If not 2xx log the response and throw an error
      if (!response.ok) {
        logger.error('Not a 2xx response:', { json });
        throw Error(`Not a 2xx response: ${response.status} ${response.statusText}`);
      }
      return RolSchema.parse(json);
    } catch (error) {
      logger.error('ROL UPDATE FAILED'); // This is picked up by a critical level alarm
      logger.error('Failed to delete and recreate rol! This is the original role:', { originalRol });
      logger.error('Rol update failed', { error });
      // Note: we use this to recover from failure manually thats why the original role is in the logs
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
