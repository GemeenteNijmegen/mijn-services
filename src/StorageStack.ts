import { GemeenteNijmegenVpc } from '@gemeentenijmegen/aws-constructs';
import { Stack, StackProps } from 'aws-cdk-lib';
import { SecurityGroup } from 'aws-cdk-lib/aws-ec2';
import { FileSystem } from 'aws-cdk-lib/aws-efs';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { Configurable } from './Configuration';
import { Statics } from './Statics';
import { TransferServer } from './TransferServer';
import { TransferUser } from './TransferUser';

interface StorageStackProps extends StackProps, Configurable {}

export class StorageStack extends Stack {
  private filesystem: FileSystem;
  constructor(scope: Construct, id: string, props: StorageStackProps) {
    super(scope, id, props);

    this.filesystem = this.createFileSytem();
    if(props.configuration.createTransferServer) {
      this.createSftpConnector(this.filesystem);
    }
  }

  private createFileSytem() {
    const nijmegenVPC = new GemeenteNijmegenVpc(this, 'vpc');
    const privateFileSystemSecurityGroup = new SecurityGroup(this, 'efs-security-group', {
      vpc: nijmegenVPC.vpc,
    });

    const fs = new FileSystem(this, 'esf-filesystem', {
      encrypted: true,
      vpc: nijmegenVPC.vpc,
      securityGroup: privateFileSystemSecurityGroup,
    });

    new StringParameter(this, 'FileSystemArnParameter', {
      parameterName: Statics._ssmFilesystemArn,
      stringValue: fs.fileSystemArn,
    });

    new StringParameter(this, 'FileSystemSecurityGroupNameParameter', {
      parameterName: Statics._ssmFilesystemSecurityGroupId,
      stringValue: privateFileSystemSecurityGroup.securityGroupId,
    });

    return fs;

  }

  createSftpConnector(filesystem: FileSystem) {
    const transferServer = new TransferServer(this, 'tfserver', {
      name: 'mijnservices-transfer-server',
      domain: 'EFS',
    });

    new TransferUser(this, 'tfuser', {
      filesystem,
      server: transferServer,
    })
  }
}
