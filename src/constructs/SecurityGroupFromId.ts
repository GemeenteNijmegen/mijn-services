import { CustomResource } from 'aws-cdk-lib';
import { ISecurityGroup, SecurityGroup } from 'aws-cdk-lib/aws-ec2';
import { PolicyStatement, Effect } from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Provider } from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';
import { SecuritygroupByNameFunction } from '../custom-resources/securitygroupByName/securitygroupByName-function';


export class SecurityGroupFromId extends Construct {
  private readonly function: lambda.Function;
  public readonly group: ISecurityGroup;
  constructor(scope: Construct, id: string, securityGroupId: string) {
    super(scope, id);

    this.function = new SecuritygroupByNameFunction(this, 'vpcsg');
    this.function.addToRolePolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ['ec2:DescribeSecurityGroups'],
      resources: ['*'], // You can scope this down later if needed
    }));

    const provider = new Provider(this, 'sg-provider', {
      onEventHandler: this.function,
    });

    const resource = new CustomResource(this, 'sg-resource', {
      serviceToken: provider.serviceToken,
      properties: {
        securityGroupName: securityGroupId,
      },
    });
    const groupId = resource.getAttString('groupId');
    this.group = SecurityGroup.fromSecurityGroupId(this, 'cfsg', groupId);
  }
}
