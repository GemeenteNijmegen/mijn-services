import { readFileSync } from 'fs';
import { join } from 'path';
import { SubmissionUtils } from '../../SubmissionUtils';


describe('SubmissionUtils', () => {

  const leidinggevende = JSON.parse(readFileSync(join(__dirname, 'leidinggevende.json')).toString('utf-8'));
  const bingo = JSON.parse(readFileSync(join(__dirname, 'bingo.json')).toString('utf-8'));
  const ontheffing = JSON.parse(readFileSync(join(__dirname, 'ontheffing.json')).toString('utf-8'));

  test('Parse phone from bingo', () => {
    const telefoon = SubmissionUtils.findTelefoon(bingo);
    expect(telefoon).toBe('+31612121212');
  });

  test('Parse phone from leidinggevende', () => {
    const telefoon = SubmissionUtils.findTelefoon(leidinggevende);
    expect(telefoon).toBe('+31612123456');
  });

  test('Parse phone from ontheffing', () => {
    const telefoon = SubmissionUtils.findTelefoon(ontheffing);
    expect(telefoon).toBe('+31612345612');
  });

  test('Parse email from bingo', () => {
    const email = SubmissionUtils.findEmail(bingo);
    expect(email).toBe('h.de.jong@example.com');
  });

  test('Parse email from leidinggevende', () => {
    const email = SubmissionUtils.findEmail(leidinggevende);
    expect(email).toBe('h.de.jong@example.com');
  });

  test('Parse email from ontheffing', () => {
    const email = SubmissionUtils.findEmail(ontheffing); // Has no email set
    expect(email).toBeUndefined();
  });

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

  test('Sanatize phone number', () => {
    const test1 = '+31-12345667';
    const test2 = '+31 12 34 56 - 67';
    const test3 = '06-12345667';
    const test4 = '0031612345667';
    const regex = /(0[8-9]00[0-9]{4,7})|(0[1-9][0-9]{8})|(\+[0-9]{9,20}|1400|140[0-9]{2,3})/; // See open-klant api docs
    expect(SubmissionUtils.sanatizePhoneNumber(test1)).toBe('+3112345667');
    expect(SubmissionUtils.sanatizePhoneNumber(test2)).toBe('+3112345667');
    expect(SubmissionUtils.sanatizePhoneNumber(test3)).toBe('0612345667');
    expect(SubmissionUtils.sanatizePhoneNumber(test4)).toBe('0031612345667');
    expect(SubmissionUtils.sanatizePhoneNumber(test1)).toMatch(regex);
    expect(SubmissionUtils.sanatizePhoneNumber(test2)).toMatch(regex);
    expect(SubmissionUtils.sanatizePhoneNumber(test3)).toMatch(regex);
    expect(SubmissionUtils.sanatizePhoneNumber(test4)).toMatch(regex);
  });

});