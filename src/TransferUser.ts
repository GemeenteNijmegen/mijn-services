import { FileSystem } from 'aws-cdk-lib/aws-efs';
import { Effect, Policy, PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { CfnUser } from 'aws-cdk-lib/aws-transfer';
import { Construct } from 'constructs';
import path from 'path';
import { TransferServer } from './TransferServer';

interface TransferUserProps {
  server: TransferServer;
  filesystem: FileSystem;

  /** Home directory for the user
   *  For EFS: Prepended with /<filesystemid>
   * 
   * Default: EFS filesystem root 
   */
  homeDirectory?: string;
}

export class TransferUser extends Construct {
  constructor(scope: Construct, id: string, props: TransferUserProps) {
    super(scope, id);
    const homeDirectory = this.homeDirectory(props);

    new CfnUser(this, 'user', {
      role: this.role(props.filesystem).roleArn,
      serverId: props.server.serverId(),
      userName: 'sftpuser',
      homeDirectory
    });
  }

  private homeDirectory(props: TransferUserProps) {
    return props.homeDirectory
      ? path.join('/', props.filesystem.fileSystemId, props.homeDirectory)
      : `/${props.filesystem.fileSystemId}`;
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
