import { FileSystem } from 'aws-cdk-lib/aws-efs';
import { Effect, Policy, PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { CfnUser } from 'aws-cdk-lib/aws-transfer';
import { Construct } from 'constructs';
import { TransferServer } from './TransferServer';

interface TransferUserProps {
  server: TransferServer;
  filesystem: FileSystem;
}

export class TransferUser extends Construct {
  constructor(scope: Construct, id: string, props: TransferUserProps) {
    super(scope, id);
    new CfnUser(this, 'user', {
      role: this.role(props.filesystem).roleArn,
      serverId: props.server.serverId(),
      userName: 'sftpuser',
    });
  }

  role(filesystem: FileSystem) {
    const policy = new Policy(this, 'TransferFamilyPolicy', {
      statements: [
        new PolicyStatement({
          effect: Effect.ALLOW,
          actions: [
            'elasticfilesystem:ClientMount',
            'elasticfilesystem:ClientRootAccess',
          ],
          resources: [
            filesystem.fileSystemArn,
          ],
        }),
      ],
    });

    const role = new Role(this, 'TransferFamilyRole', {
      assumedBy: new ServicePrincipal('transfer.amazonaws.com'),
      description: 'Role for accessing EFS via transfer family',
    });
    role.attachInlinePolicy(policy);

    return role;
  }
}
