import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';
import { Statics } from '../../Statics';

/**
 * This class adds a set of parameters for the objects API and NotifyNL. Currently
 * only supports one set.
 */
export class ObjectNotificationServicesSecrets extends Construct {
  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.addSecrets();

  }

  addSecrets() {
    for (let [index, secret] of [
      {
        secretName: Statics.ssmObjectNotifierNotifyToken,
        description: 'NotifyNL access token secret',
      },
      {
        secretName: Statics.ssmObjectNotifierObjectsToken,
        description: 'Objects API token',
      },
    ].entries()) {
      new Secret(this, `secret-${index}`, {
        description: secret.description,
        secretName: secret.secretName,
      });
    }
  }
}
