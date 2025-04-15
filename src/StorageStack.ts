import { GemeenteNijmegenVpc } from '@gemeentenijmegen/aws-constructs';
import { Stack } from 'aws-cdk-lib';
import { SecurityGroup } from 'aws-cdk-lib/aws-ec2';
import { FileSystem } from 'aws-cdk-lib/aws-efs';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { Statics } from './Statics';

export class StorageStack extends Stack {
  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.createFileSytem();
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
}
