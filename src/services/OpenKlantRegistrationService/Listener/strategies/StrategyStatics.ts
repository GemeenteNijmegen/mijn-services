import { createHash } from 'crypto';


export class StrategyStatics {
  static readonly PSUEDOID_REGISTER = 'REGISTRATION-SERVICE';
  static constructPseudoId(kvk: string, name: string) {
    const base = `${kvk}-${name}`;
    return createHash('sha265').update(base).digest('hex');
  }
}