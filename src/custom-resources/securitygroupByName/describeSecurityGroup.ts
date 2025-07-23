import { EC2Client, DescribeSecurityGroupsCommand } from '@aws-sdk/client-ec2';

export async function describeSecurityGroup(name: any) {
  const client = new EC2Client();
  const command = new DescribeSecurityGroupsCommand({
    Filters: [
      {
        Name: 'group-name',
        Values: ['CloudFront-VPCOrigins-Service-SG'],
      },
    ],
  });
  const response = await client.send(command);
  if (response.SecurityGroups?.length && response.SecurityGroups.length == 1) {
    return response.SecurityGroups[0];
  }
  return false;
}
