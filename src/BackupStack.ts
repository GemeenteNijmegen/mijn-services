import { RemovalPolicy, Stack, StackProps, aws_backup as backup } from 'aws-cdk-lib';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { Configurable } from './Configuration';
import { Statics } from './Statics';

interface BackupStackProps extends StackProps, Configurable { }

export class BackupStack extends Stack {

  constructor(scope: Construct, id: string, props: BackupStackProps) {
    super(scope, id, props);

    const backupVault = new backup.BackupVault(this, 'backup-vault', {
      removalPolicy: RemovalPolicy.RETAIN,
    });

    new StringParameter(this, 'backup-vault-arn', {
      stringValue: backupVault.backupVaultArn,
      parameterName: Statics._ssmBackupVaultArn,
    });

  }

}