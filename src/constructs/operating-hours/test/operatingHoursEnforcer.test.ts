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
import { mockClient } from 'aws-sdk-client-mock';
import { handler, isWithinOperatingHours } from '../operatingHoursEnforcer.lambda';

const ecsMock = mockClient(ECSClient);
const dynamoMock = mockClient(DynamoDBClient);

const CLUSTER_ARN = 'arn:aws:ecs:eu-west-1:123456789012:cluster/test-cluster';
const SERVICE_ARN = 'arn:aws:ecs:eu-west-1:123456789012:service/test-cluster/svc-1';
const TABLE_NAME = 'test-table';

beforeEach(() => {
  ecsMock.reset();
  dynamoMock.reset();
  process.env.CLUSTER_ARN = CLUSTER_ARN;
  process.env.TABLE_NAME = TABLE_NAME;
  process.env.START_HOUR = '8';
  process.env.END_HOUR = '18';
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// isWithinOperatingHours
// ---------------------------------------------------------------------------

describe('isWithinOperatingHours', () => {
  describe('normal range (start < end)', () => {
    it('returns true for an hour in the middle of the range', () => {
      expect(isWithinOperatingHours(12, 8, 18)).toBe(true);
    });

    it('returns true at the start boundary (inclusive)', () => {
      expect(isWithinOperatingHours(8, 8, 18)).toBe(true);
    });

    it('returns false at the end boundary (exclusive)', () => {
      expect(isWithinOperatingHours(18, 8, 18)).toBe(false);
    });

    it('returns false before the range', () => {
      expect(isWithinOperatingHours(6, 8, 18)).toBe(false);
    });

    it('returns false after the range', () => {
      expect(isWithinOperatingHours(22, 8, 18)).toBe(false);
    });
  });

  describe('overnight range (start > end, spans midnight)', () => {
    it('returns true just after the start hour', () => {
      expect(isWithinOperatingHours(23, 22, 6)).toBe(true);
    });

    it('returns true at midnight', () => {
      expect(isWithinOperatingHours(0, 22, 6)).toBe(true);
    });

    it('returns true before the end hour', () => {
      expect(isWithinOperatingHours(5, 22, 6)).toBe(true);
    });

    it('returns false at the end boundary (exclusive)', () => {
      expect(isWithinOperatingHours(6, 22, 6)).toBe(false);
    });

    it('returns false in the middle of the day', () => {
      expect(isWithinOperatingHours(14, 22, 6)).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// handler — stop path (outside operating hours)
// ---------------------------------------------------------------------------

describe('handler – stop path', () => {
  beforeEach(() => {
    jest.spyOn(Date.prototype, 'getUTCHours').mockReturnValue(22); // outside 8–18
  });

  it('saves desired counts and scales all running services to 0', async () => {
    dynamoMock.on(QueryCommand).resolves({ Items: [] });
    ecsMock.on(ListServicesCommand).resolves({ serviceArns: [SERVICE_ARN] });
    ecsMock.on(DescribeServicesCommand).resolves({
      services: [{ serviceArn: SERVICE_ARN, desiredCount: 2 }],
    });
    dynamoMock.on(PutItemCommand).resolves({});
    ecsMock.on(UpdateServiceCommand).resolves({});

    await handler();

    const puts = dynamoMock.commandCalls(PutItemCommand);
    expect(puts).toHaveLength(1);
    expect(puts[0].args[0].input.Item?.desiredCount.N).toBe('2');
    expect(puts[0].args[0].input.Item?.serviceArn.S).toBe(SERVICE_ARN);

    const updates = ecsMock.commandCalls(UpdateServiceCommand);
    expect(updates).toHaveLength(1);
    expect(updates[0].args[0].input.desiredCount).toBe(0);
    expect(updates[0].args[0].input.service).toBe(SERVICE_ARN);
  });

  it('skips services that are already at 0 desired tasks', async () => {
    dynamoMock.on(QueryCommand).resolves({ Items: [] });
    ecsMock.on(ListServicesCommand).resolves({ serviceArns: [SERVICE_ARN] });
    ecsMock.on(DescribeServicesCommand).resolves({
      services: [{ serviceArn: SERVICE_ARN, desiredCount: 0 }],
    });

    await handler();

    expect(dynamoMock.commandCalls(PutItemCommand)).toHaveLength(0);
    expect(ecsMock.commandCalls(UpdateServiceCommand)).toHaveLength(0);
  });

  it('is idempotent: skips ECS calls when DynamoDB already has saved state', async () => {
    dynamoMock.on(QueryCommand).resolves({
      Items: [{
        clusterArn: { S: CLUSTER_ARN },
        serviceArn: { S: SERVICE_ARN },
        desiredCount: { N: '2' },
      }],
    });

    await handler();

    expect(ecsMock.commandCalls(ListServicesCommand)).toHaveLength(0);
    expect(ecsMock.commandCalls(UpdateServiceCommand)).toHaveLength(0);
  });

  it('does nothing when the cluster has no services', async () => {
    dynamoMock.on(QueryCommand).resolves({ Items: [] });
    ecsMock.on(ListServicesCommand).resolves({ serviceArns: [] });

    await handler();

    expect(dynamoMock.commandCalls(PutItemCommand)).toHaveLength(0);
    expect(ecsMock.commandCalls(UpdateServiceCommand)).toHaveLength(0);
  });

  it('handles paginated ListServices results', async () => {
    const page1 = Array.from({ length: 100 }, (_, i) => `${SERVICE_ARN}-${i}`);
    const page2 = [`${SERVICE_ARN}-extra`];

    dynamoMock.on(QueryCommand).resolves({ Items: [] });
    ecsMock.on(ListServicesCommand)
      .resolvesOnce({ serviceArns: page1, nextToken: 'page2' })
      .resolvesOnce({ serviceArns: page2 });
    ecsMock.on(DescribeServicesCommand).resolves({ services: [] });

    await handler();

    const listCalls = ecsMock.commandCalls(ListServicesCommand);
    expect(listCalls).toHaveLength(2);
    expect(listCalls[1].args[0].input.nextToken).toBe('page2');
  });

  it('batches DescribeServices calls in groups of 10', async () => {
    const serviceArns = Array.from({ length: 11 }, (_, i) => `${SERVICE_ARN}-${i}`);

    dynamoMock.on(QueryCommand).resolves({ Items: [] });
    ecsMock.on(ListServicesCommand).resolves({ serviceArns });
    ecsMock.on(DescribeServicesCommand).resolves({ services: [] });

    await handler();

    const describeCalls = ecsMock.commandCalls(DescribeServicesCommand);
    expect(describeCalls).toHaveLength(2);
    expect(describeCalls[0].args[0].input.services).toHaveLength(10);
    expect(describeCalls[1].args[0].input.services).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// handler — start path (within operating hours)
// ---------------------------------------------------------------------------

describe('handler – start path', () => {
  beforeEach(() => {
    jest.spyOn(Date.prototype, 'getUTCHours').mockReturnValue(10); // inside 8–18
  });

  it('restores desired counts from DynamoDB and deletes the saved records', async () => {
    dynamoMock.on(QueryCommand).resolves({
      Items: [{
        clusterArn: { S: CLUSTER_ARN },
        serviceArn: { S: SERVICE_ARN },
        desiredCount: { N: '3' },
      }],
    });
    ecsMock.on(UpdateServiceCommand).resolves({});
    dynamoMock.on(DeleteItemCommand).resolves({});

    await handler();

    const updates = ecsMock.commandCalls(UpdateServiceCommand);
    expect(updates).toHaveLength(1);
    expect(updates[0].args[0].input.desiredCount).toBe(3);
    expect(updates[0].args[0].input.service).toBe(SERVICE_ARN);

    const deletes = dynamoMock.commandCalls(DeleteItemCommand);
    expect(deletes).toHaveLength(1);
    expect(deletes[0].args[0].input.Key?.serviceArn.S).toBe(SERVICE_ARN);
  });

  it('does nothing when there is no saved state (services already running)', async () => {
    dynamoMock.on(QueryCommand).resolves({ Items: [] });

    await handler();

    expect(ecsMock.commandCalls(UpdateServiceCommand)).toHaveLength(0);
    expect(dynamoMock.commandCalls(DeleteItemCommand)).toHaveLength(0);
  });

  it('restores each service independently', async () => {
    const svc2 = `${SERVICE_ARN}-2`;
    dynamoMock.on(QueryCommand).resolves({
      Items: [
        { clusterArn: { S: CLUSTER_ARN }, serviceArn: { S: SERVICE_ARN }, desiredCount: { N: '1' } },
        { clusterArn: { S: CLUSTER_ARN }, serviceArn: { S: svc2 }, desiredCount: { N: '4' } },
      ],
    });
    ecsMock.on(UpdateServiceCommand).resolves({});
    dynamoMock.on(DeleteItemCommand).resolves({});

    await handler();

    expect(ecsMock.commandCalls(UpdateServiceCommand)).toHaveLength(2);
    expect(dynamoMock.commandCalls(DeleteItemCommand)).toHaveLength(2);
  });
});
