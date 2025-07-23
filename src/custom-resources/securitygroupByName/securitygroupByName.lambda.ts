import { CdkCustomResourceEvent, CdkCustomResourceResponse } from 'aws-lambda';
import { describeSecurityGroup } from './describeSecurityGroup';

export async function handler(event: CdkCustomResourceEvent): Promise<CdkCustomResourceResponse> {
  console.log(JSON.stringify(event));

  if (event.RequestType == 'Delete') {
    console.error('Delete events are not implemented for this custom resource.');
    return {};
  }

  const name = event.ResourceProperties.securityGroupName;

  const group = await describeSecurityGroup(name);
  console.debug(group);
  if (group) {
    return {
      Data: {
        groupId: group.GroupId,
      },
    };
  } else {
    console.error('Group ID not found');
    return {};
  }
}
