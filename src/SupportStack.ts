import { Stack } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Configurable, ObjectNotificationServiceConfiguration } from './ConfigurationInterfaces';
import { ObjectNotificationService } from './services/ObjectNotificatieService/ObjectNotificationService';
import { ObjectNotificationServicesSecrets } from './services/ObjectNotificatieService/ObjectNotificationServicesParameters';

/**
 * Stack for supporting services, which are independent
 * of the ECS cluster created in main stack
 */
interface SupportStackProps extends Configurable { }
export class SupportStack extends Stack {
  constructor(scope: Construct, id: string, props: SupportStackProps) {
    super(scope, id);

    this.setupObjectNotificationServices(props.configuration.ObjectNotificationServices);
  }

  setupObjectNotificationServices(services?: ObjectNotificationServiceConfiguration[]) {
    if (!services) {
      return;
    }
    new ObjectNotificationServicesSecrets(this, 'objectnotifier-params');
    // TODO create config table
    for (let service of services) {
      new ObjectNotificationService(this, `objectservcice-${service.configKey}`, service);
    }
  }
}
