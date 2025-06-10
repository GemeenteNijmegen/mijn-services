
export class SubmissionUtils {

  static findEmail(submission: any) {
    const options = [
      'eMailadres',
      'eMailadres1',
      'eMailadres2',
    ];
    return this.findField<string>(submission, options);
  }

  static findTelefoon(submission: any) {
    const options = [
      'telefoonnummer',
      'telefoon',
    ];
    return this.findField<string>(submission, options);
  }

  static findField<T>(submission: any, fields: string[]) {
    for (const field of fields) {
      const email = SubmissionUtils.findValueByKey(submission, field);
      if (email) {
        return email as T;
      }
    }
    return undefined;
  }

  static findValueByKey(obj: any, keyToFind: string): any | undefined {
    if (typeof obj !== 'object' || obj === null) {
      console.log('UNDEFINED')
      return undefined;
    }

    // Check if the current object has the key
    if (keyToFind in obj) {
      return obj[keyToFind];
    }

    // Recursively check nested objects
    for (const key in obj) {
      if (typeof obj[key] === 'object') {
        const value = SubmissionUtils.findValueByKey(obj[key], keyToFind);
        if (value !== undefined) {
          return value;
        }
      }
    }

    return undefined;
  }


  static findKanaalvoorkeur(submission: any) {

    // APV blok 2
    const gebruikEmail = SubmissionUtils.findField<string>(submission, [
      'deGemeenteMagDitEMailadresGebruikenOmTeReagerenOpMijnAanvraag',
    ]);
    if (gebruikEmail?.toLocaleLowerCase() === 'ja') {
      return 'email';
    } else if (gebruikEmail?.toLocaleLowerCase() === 'nee') {
      return 'sms';
    }

    // APV blok 1 (en overig)
    const kanaalvoorkeur = SubmissionUtils.findField<string>(submission, [
      'hoeWiltUOpDeHoogteGehoudenWorden',
      'hoeWiltUDatDeGemeenteContactMetUOpneemtOverAanvraagAlsDatNodigIs',
      'hoeWiltUDatDeGemeenteContactMetUOpneemtOverUwAanvraagAlsDatNodigIs',
    ]);

    if (!kanaalvoorkeur) {
      return undefined;
    }

    const lowercaseVoorkeur = kanaalvoorkeur.toLocaleLowerCase();
    if (['sms', 'viasms', 'viatelefoon'].includes(lowercaseVoorkeur)) {
      return 'sms';
    } else if (['e-mail', 'email', 'viaemail'].includes(lowercaseVoorkeur)) {
      return 'email';
    }
    return undefined;
  }

}