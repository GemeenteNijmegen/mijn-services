import { Utils } from '../src/Utils';

describe('Utils', () => {
  describe('toPythonBooleanString', () => {

    it('should throw an error when both arguments are undefined', () => {
      expect(() => {
        Utils.toPythonBooleanString();
      }).toThrow('No value provided and no default value provided');
    });

    it('should return "True" when the boolean value is true', () => {
      expect(Utils.toPythonBooleanString(true)).toBe('True');
    });

    it('should return "False" when the boolean value is false', () => {
      expect(Utils.toPythonBooleanString(false)).toBe('False');
    });

    it('should return "True" when boolean is undefined and defaultValue is true', () => {
      expect(Utils.toPythonBooleanString(undefined, true)).toBe('True');
    });

    it('should return "False" when boolean is undefined and defaultValue is false', () => {
      expect(Utils.toPythonBooleanString(undefined, false)).toBe('False');
    });

    it('should return "False" when boolean is false and defaultValue is undefined', () => {
      expect(Utils.toPythonBooleanString(false, undefined)).toBe('False');
    });

    it('should return "True" when boolean is true and defaultValue is undefined', () => {
      expect(Utils.toPythonBooleanString(true, undefined)).toBe('True');
    });
  });
});
