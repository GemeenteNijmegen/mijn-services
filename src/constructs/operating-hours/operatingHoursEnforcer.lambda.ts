import {
  DeleteItemCommand,
  DynamoDBClient,
  PutItemCommand,
  QueryCommand,
} from '@aws-sdk/client-dynamodb';
import {
  DescribeServicesCommand,
  ECSClient,
  ListServicesCommand,
  UpdateServiceCommand,
} from '@aws-sdk/client-ecs';

const ecsClient = new ECSClient({});
const dynamoClient = new DynamoDBClient({});

export async function handler(): Promise<void> {
  const clusterArn = process.env.CLUSTER_ARN!;
  const tableName = process.env.TABLE_NAME!;
  const startHour = parseInt(process.env.START_HOUR!);
  const endHour = parseInt(process.env.END_HOUR!);

  const currentHour = new Date().getUTCHours();
  const within = isWithinOperatingHours(currentHour, startHour, endHour);

  console.log(JSON.stringify({ clusterArn, currentHour, startHour, endHour, within }));

  if (within) {
    await startServices(clusterArn, tableName);
  } else {
    await stopServices(clusterArn, tableName);
  }
}

export function isWithinOperatingHours(currentHour: number, startHour: number, endHour: number): boolean {
  if (startHour <= endHour) {
    return currentHour >= startHour && currentHour < endHour;
  }
  // Spans midnight
  return currentHour >= startHour || currentHour < endHour;
}

async function stopServices(clusterArn: string, tableName: string): Promise<void> {
  // Idempotent: skip if we already saved state (services already stopped by us)
  const existing = await loadSavedCounts(clusterArn, tableName);
  if (existing.length > 0) {
    console.log('Services already stopped, skipping.');
    return;
  }

  const serviceArns = await listAllServices(clusterArn);
  if (serviceArns.length === 0) {
    console.log('No services found in cluster.');
    return;
  }

  const services = await describeServices(clusterArn, serviceArns);

  for (const { serviceArn, desiredCount } of services) {
    if (desiredCount === 0) continue;
    await saveDesiredCount(tableName, clusterArn, serviceArn, desiredCount);
    await setServiceDesiredCount(clusterArn, serviceArn, 0);
    console.log(`Stopped ${serviceArn} (was ${desiredCount})`);
  }
}

async function startServices(clusterArn: string, tableName: string): Promise<void> {
  const saved = await loadSavedCounts(clusterArn, tableName);
  if (saved.length === 0) {
    console.log('No saved state found, services already running.');
    return;
  }

  for (const { serviceArn, desiredCount } of saved) {
    await setServiceDesiredCount(clusterArn, serviceArn, desiredCount);
    await deleteSavedCount(tableName, clusterArn, serviceArn);
    console.log(`Started ${serviceArn} (restored to ${desiredCount})`);
  }
}

async function listAllServices(clusterArn: string): Promise<string[]> {
  const arns: string[] = [];
  let nextToken: string | undefined;

  do {
    const response = await ecsClient.send(new ListServicesCommand({
      cluster: clusterArn,
      nextToken,
      maxResults: 100,
    }));
    arns.push(...(response.serviceArns ?? []));
    nextToken = response.nextToken;
  } while (nextToken);

  return arns;
}

async function describeServices(
  clusterArn: string,
  serviceArns: string[],
): Promise<Array<{ serviceArn: string; desiredCount: number }>> {
  const results: Array<{ serviceArn: string; desiredCount: number }> = [];

  // DescribeServices accepts at most 10 per call
  for (let i = 0; i < serviceArns.length; i += 10) {
    const response = await ecsClient.send(new DescribeServicesCommand({
      cluster: clusterArn,
      services: serviceArns.slice(i, i + 10),
    }));
    for (const svc of response.services ?? []) {
      results.push({ serviceArn: svc.serviceArn!, desiredCount: svc.desiredCount ?? 0 });
    }
  }

  return results;
}

async function setServiceDesiredCount(clusterArn: string, serviceArn: string, desiredCount: number): Promise<void> {
  await ecsClient.send(new UpdateServiceCommand({
    cluster: clusterArn,
    service: serviceArn,
    desiredCount,
  }));
}

async function saveDesiredCount(
  tableName: string,
  clusterArn: string,
  serviceArn: string,
  desiredCount: number,
): Promise<void> {
  await dynamoClient.send(new PutItemCommand({
    TableName: tableName,
    Item: {
      clusterArn: { S: clusterArn },
      serviceArn: { S: serviceArn },
      desiredCount: { N: desiredCount.toString() },
    },
  }));
}

async function loadSavedCounts(
  clusterArn: string,
  tableName: string,
): Promise<Array<{ serviceArn: string; desiredCount: number }>> {
  const response = await dynamoClient.send(new QueryCommand({
    TableName: tableName,
    KeyConditionExpression: 'clusterArn = :clusterArn',
    ExpressionAttributeValues: {
      ':clusterArn': { S: clusterArn },
    },
  }));

  return (response.Items ?? []).map(item => ({
    serviceArn: item.serviceArn.S!,
    desiredCount: parseInt(item.desiredCount.N!),
  }));
}

async function deleteSavedCount(tableName: string, clusterArn: string, serviceArn: string): Promise<void> {
  await dynamoClient.send(new DeleteItemCommand({
    TableName: tableName,
    Key: {
      clusterArn: { S: clusterArn },
      serviceArn: { S: serviceArn },
    },
  }));
}
