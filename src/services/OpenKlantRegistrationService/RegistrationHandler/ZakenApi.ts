import { logger } from '../Shared/Logger';
import { Rol, RolSchema } from '../Shared/model/Rol';
import { Zaak, ZaakSchema } from '../Shared/model/Zaak';
import { NotFoundError, ZgwApi, ZgwApiProps } from './ZgwApi';

export interface IZakenApi {
  getRol(url: string): Promise<Rol>;
  updateRol(rol: Rol): Promise<Rol>;
  getZaak(url: string): Promise<Zaak>;
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
    try {
      const response = await this.get(url);
      const result = await response.json();
      return RolSchema.parse(result);
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw new NotFoundError('rol');
      }
      throw error;
    }
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

    if (!rol.contactpersoonRol?.naam || rol.contactpersoonRol.naam === "") {
      throw Error('Cannot update a rol without naam in contactpersoonRol');
    }

    const originalRol = await this.getRol(rol.url);
    let deleted = false;
    try {

      logger.debug('Updating rol');
      await this.delete(rol.url);
      deleted = true;

      const response = await this.post(this.zakenApiUrl + '/rollen', {
        body: JSON.stringify({
          ...rol,
          url: undefined,
          uuid: undefined,
          registratiedatum: undefined,
        }),
      });

      const json = await response.json();
      logger.debug('Response', { json });

      // If not 2xx log the response and throw an error
      if (!response.ok) {
        logger.error('Not a 2xx response:', { json });
        throw Error(`Not a 2xx response: ${response.status} ${response.statusText}`);
      }
      return RolSchema.parse(json);
    } catch (error) {

      // If the rol was not deleted or the delete call failed, don't panic the rol still exists.
      if (deleted) {
        // If an error is thrown after the rol was deleted -> do panic!
        logger.error('ROL UPDATE FAILED'); // This is picked up by a critical level alarm
        logger.error('Failed to delete and recreate rol! This is the original role:', { originalRol });
        logger.error('Rol update failed', { error });
      } else {
        logger.error('Failed to update rol (deletion failed)', { error });
      }
      // Note: we use this to recover from failure manually thats why the original role is in the logs
      throw Error('Could not update rol');
    }

  }


  async getZaak(url: string): Promise<Zaak> {
    try {
      const expantedUrl = url + '?expand=eigenschappen';
      const response = await this.get(expantedUrl);
      const result = await response.json();
      return ZaakSchema.parse(result);
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw new NotFoundError('zaak');
      }
      throw error;
    }
  }

}
