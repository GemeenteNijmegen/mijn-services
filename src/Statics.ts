export class Statics {
  static readonly projectName = 'mijn-services';
  static readonly projectRepo = 'GemeenteNijmegen/mijn-services';
  static readonly organization = 'GemeenteNijmegen';

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
  static readonly _ssmOpenKlantCredentials = `/${Statics.projectName}/internal/open-klant/credentials`;
  static readonly _ssmOpenNotificatiesCredentials = `/${Statics.projectName}/internal/open-notificaties/credentials`;
  static readonly _ssmRabbitMqCredentials = `/${Statics.projectName}/internal/open-notificaties/rabbit-mq/credentials`;
  static readonly _ssmClientCredentialsZaakNotifications = `/${Statics.projectName}/internal/open-notificaties/client/credentials/zaak-notifications`;
  static readonly _ssmClientCredentialsNotificationsZaak = `/${Statics.projectName}/internal/open-notificaties/client/credentials/notifications-zaak`;
  static readonly _ssmOpenZaakCredentials = `/${Statics.projectName}/internal/open-zaak/credentials`;
  static readonly _ssmDatabaseArn = `/${Statics.projectName}/internal/database/arn`;
  static readonly _ssmDatabaseHostname = `/${Statics.projectName}/internal/database/hostname`;
  static readonly _ssmDatabasePort = `/${Statics.projectName}/internal/database/post`;
  static readonly _ssmDatabaseSecurityGroup = `/${Statics.projectName}/internal/database/security-group`;

  // MARK: Databases
  static readonly defaultDatabaseName = 'postgres';
  static readonly databaseOpenKlant = 'open-klant';
  static readonly databaseOpenNotificaties = 'open-notificaties';
  static readonly databaseOpenZaak = 'open-zaak';

  /**
   * PRODUCTION
   * List all databases that should be
   * present in a single array
   */
  static readonly databasesProduction = [
    Statics.databaseOpenKlant,
  ];

  /**
   * ACCEPTANCE
   * List all databases that should be
   * present in a single array
   */
  static readonly databasesAcceptance = [
    Statics.databaseOpenKlant,
    Statics.databaseOpenNotificaties,
    Statics.databaseOpenZaak,
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