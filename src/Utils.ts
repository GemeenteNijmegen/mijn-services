

export class Utils {
  static toPythonBooleanString(boolean: boolean): string;
  static toPythonBooleanString(boolean?: boolean, defaultValue?: boolean): string;
  static toPythonBooleanString(boolean?: boolean, defaultValue?: boolean) {
    if (boolean == undefined && defaultValue == undefined) {
      throw Error('No value provided and no default value provided');
    }
    if (boolean != undefined) {
      return boolean ? 'True' : 'False';
    }
    return defaultValue ? 'True' : 'False';
  }
}