import { PermissionsBoundaryAspect } from '@gemeentenijmegen/aws-constructs';
import { Aspects, Stage, StageProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Configurable } from './Configuration';
import { DatabaseStack } from './DatabaseStack';
import { MainStack } from './MainStack';
import { StorageStack } from './StorageStack';
import { BackupStack } from './BackupStack';

interface MijnServicesStageProps extends StageProps, Configurable {}

export class MijnServicesStage extends Stage {

  constructor(scope: Construct, id: string, props: MijnServicesStageProps) {
    super(scope, id, props);
    Aspects.of(this).add(new PermissionsBoundaryAspect());

    const backupStack = new BackupStack(this, 'backup-stack', {
      env: props.configuration.deploymentEnvironment,
      configuration: props.configuration,
    });

    const databaseStack = new DatabaseStack(this, 'database-stack', {
      env: props.configuration.deploymentEnvironment,
      configuration: props.configuration,
    });
    databaseStack.addDependency(backupStack, 'Backup stack needs to be created first');

    const storageStack = new StorageStack(this, 'storage-stack', { configuration: props.configuration });

    const mainStack = new MainStack(this, 'stack', {
      env: props.configuration.deploymentEnvironment, // Translates to mijn-services-stack
      configuration: props.configuration,
    });
    mainStack.addDependency(databaseStack, 'Services in main stack need the DB to be created');
    mainStack.addDependency(storageStack, 'Services in main stack need the storage (filesystem) to be created');
  }
}
