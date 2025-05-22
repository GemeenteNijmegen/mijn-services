import { readFileSync } from 'fs';
import { join } from 'path';
import { SubmissionUtils } from '../../SubmissionUtils';


describe('SubmissionUtils', () => {

  const leidinggevende = JSON.parse(readFileSync(join(__dirname, 'leidinggevende.json')).toString('utf-8'));
  const bingo = JSON.parse(readFileSync(join(__dirname, 'bingo.json')).toString('utf-8'));

  test('Parse email preference from bingo', () => {
    const voorkeur = SubmissionUtils.findKanaalvoorkeur(bingo);
    expect(voorkeur).toBe('email');
  });

  test('Parse email preference from leidinggevende', () => {
    const voorkeur = SubmissionUtils.findKanaalvoorkeur(leidinggevende);
    expect(voorkeur).toBe('email');
  });

  test('Parse sms preference from leidinggevende', () => {
    const test = { ...leidinggevende, hoeWiltUDatDeGemeenteContactMetUOpneemtOverUwAanvraagAlsDatNodigIs: 'viaSms' };
    const voorkeur = SubmissionUtils.findKanaalvoorkeur(test);
    expect(voorkeur).toBe('sms');
  });

  test('Parse sms preference from bingo', () => {
    const test = { ...bingo, deGemeenteMagDitEMailadresGebruikenOmTeReagerenOpMijnAanvraag: 'nee' };
    const voorkeur = SubmissionUtils.findKanaalvoorkeur(test);
    expect(voorkeur).toBe('sms');
  });

});