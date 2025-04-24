import { Tags } from 'aws-cdk-lib';
import { CfnServer } from 'aws-cdk-lib/aws-transfer';
import { Construct } from 'constructs';

interface TransferServerProps {
  /** User-friendly name for the server */
  name: string;
  identityProviderType?: 'SERVICE_MANAGED' | 'AWS_DIRECTORY_SERVICE' | 'API_GATEWAY' | 'AWS_LAMBDA';
  IdentityProviderDetails?: CfnServer.IdentityProviderDetailsProperty;
  endpointType?: 'VPC' | 'PUBLIC';
  protocols?: string[];
  domain?: 'S3'|'EFS';
}

export class TransferServer extends Construct {
  private server: CfnServer;
  // constructor
  constructor(scope: Construct, id: string, props: TransferServerProps) {
    super(scope, id);
    if (props.identityProviderType && props.identityProviderType != 'SERVICE_MANAGED' && !props.IdentityProviderDetails) {
      throw Error('If Identity provider Type is not SERVICE_MANAGED, IdentityPoolProviderDetails are required');
    }
    this.server = new CfnServer(this, 'SftpServer', {
      identityProviderType: props.identityProviderType ?? 'SERVICE_MANAGED',
      endpointType: props.endpointType ?? 'PUBLIC',
      protocols: props.protocols ?? ['SFTP'],
      domain: props.domain,
    });
    Tags.of(this.server).add('Name', props.name);
  }

  public serverId() {
    return this.server.attrServerId;
  }
}
