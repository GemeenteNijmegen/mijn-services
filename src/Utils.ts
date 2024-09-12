

export class Utils {
  static toPythonBooleanString(boolean: boolean) : string;
  static toPythonBooleanString(boolean?: boolean, otherwise?: boolean) : string;
  static toPythonBooleanString(boolean?: boolean, otherwise?: boolean) {
    if (!boolean && !otherwise) {
      throw Error('No value provided and no default value provided');
    }
    const val = boolean ?? otherwise;
    return val ? 'True' : 'False';
  }
}