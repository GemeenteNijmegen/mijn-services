

export class Utils {
  static toPythonBooleanString(boolean: boolean) : string;
  static toPythonBooleanString(boolean?: boolean, defaultValue?: boolean) : string;
  static toPythonBooleanString(boolean?: boolean, defaultValue?: boolean) {
    if (!boolean && !defaultValue) {
      throw Error('No value provided and no default value provided');
    }
    const val = boolean ?? defaultValue;
    return val ? 'True' : 'False';
  }
}