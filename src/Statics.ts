export class Statics {
  static readonly projectName = 'mijn-services';
  static readonly projectRepo = 'GemeenteNijmegen/mijn-services';

  // MAKR: SSM Parameters
  static readonly ssmDummyParameter = `/${Statics.projectName}/dummy/parameter`;

  // MARK: ENVIRONMENTS
  static readonly gnBuildEnvironment = {
    account: '836443378780',
    region: 'eu-central-1',
  };

  static readonly gnMijnServicesAccp = {
    account: '145023129433',
    region: 'eu-central-1',
  };

  static readonly gnMijnServicesProd = {
    account: '692859927138',
    region: 'eu-central-1',
  };

}