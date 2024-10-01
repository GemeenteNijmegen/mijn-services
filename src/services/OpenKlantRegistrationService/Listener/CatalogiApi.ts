import { RolType, RolTypeSchema } from './model/RolType';
import { ZgwApi, ZgwApiProps } from './ZgwApi';

export interface ICatalogiApi {
  getRolType(url: string) : Promise<RolType>;
}

export class CatalogiApi extends ZgwApi implements ICatalogiApi {

  constructor(props: ZgwApiProps) {
    super(props);
  }

  async getRolType(url: string) : Promise<RolType> {
    const response = await this.get(url);
    const result = await response.json();
    return RolTypeSchema.parse(result);
  }

}

export class CatalogiApiMock implements ICatalogiApi {
  async getRolType(_url: string): Promise<RolType> {
    throw new Error('This method should be mocked.');
  }
}
