export class Statics {
  static readonly projectName = 'mijn-services';
  static readonly projectRepo = 'GemeenteNijmegen/mijn-services';

  // MARK: SSM Parameters
  static readonly ssmDummyParameter = `/${Statics.projectName}/dummy/parameter`;

  // Managed in dns-managment project:
  // Below references the new hosted zone separeted from webformulieren
  static readonly ssmAccountRootHostedZonePath: string = '/gemeente-nijmegen/account/hostedzone';
  static readonly ssmAccountRootHostedZoneId: string = '/gemeente-nijmegen/account/hostedzone/id';
  static readonly ssmAccountRootHostedZoneName: string = '/gemeente-nijmegen/account/hostedzone/name';

  // Lets use _ for denoting internal like parameters (eg for stack decoupling)
  static readonly _ssmCertificateArn = `/${Statics.projectName}/internal/cloudfront/cert-arn`;
  static readonly _ssmDatabaseCredentials = `/${Statics.projectName}/internal/database/credentials`;
  static readonly _ssmDatabaseArn = `/${Statics.projectName}/internal/database/arn`;
  static readonly _ssmDatabaseHostname = `/${Statics.projectName}/internal/database/hostname`;
  static readonly _ssmDatabasePort = `/${Statics.projectName}/internal/database/post`;
  static readonly _ssmDatabaseSecurityGroup = `/${Statics.projectName}/internal/database/security-group`;

  // MARK: Databases
  static readonly defaultDatabaseName = 'default-database';
  static readonly databaseOpenKlant = 'open-klant';

  /**
   * List all databases that should be
   * present in a single array
   */
  static readonly databases = [
    Statics.databaseOpenKlant,
  ];

  // MARK: Environments
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