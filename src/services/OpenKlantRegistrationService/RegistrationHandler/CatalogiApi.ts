import { ZgwApi, ZgwApiProps } from './ZgwApi';
import { RolType, RolTypeWithUrl, RolTypeWithUrlSchema } from '../Shared/model/RolType';

export interface ICatalogiApi {
  getRolType(url: string): Promise<RolType>;
}

export class CatalogiApi extends ZgwApi implements ICatalogiApi {

  constructor(props: ZgwApiProps) {
    super(props);
  }

  async getRolType(url: string): Promise<RolTypeWithUrl> {
    const response = await this.get(url);
    const result = await response.json();
    return RolTypeWithUrlSchema.parse(result);
  }

}