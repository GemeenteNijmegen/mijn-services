import { StrategyStatics } from '../strategies/StrategyStatics';


test('PseudoID calculator', () => {
  const kvk = '12345678';
  const name = 'H. de Jong';
  const id = StrategyStatics.constructPseudoId(kvk, name);
  expect(id).toBe('8a0ebaf3c5b4c4b8bd3db2cb92432454f824ca1e1abe969b541999f2b6ca9c6c');
  const id2 = StrategyStatics.constructPseudoId(kvk, name + '-Jansen');
  expect(id).not.toEqual(id2);
});

test('Constant registery id', () => {
  expect(StrategyStatics.PSUEDOID_REGISTER).toBe('REGISTRATION-SERVICE');
});