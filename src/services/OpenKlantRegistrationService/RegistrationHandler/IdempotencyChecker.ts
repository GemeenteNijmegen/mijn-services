import { DynamoDBClient, GetItemCommand, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { createHash } from 'crypto';


export class IdempotencyChecker {

  constructor(
    private readonly tableName: string,
    private readonly dynamodb: DynamoDBClient,
  ) { }

  async checkAlreadyHandled(hashKey: string) {
    const response = await this.dynamodb.send(new GetItemCommand({
      Key: {
        hash: { S: hashKey },
      },
      TableName: this.tableName,
    }));
    if (response.Item) {
      return true;
    }
    return false;
  }

  async registerIdempotencyCheck(hashKey: string) {
    const hash = createHash('sha256').update(JSON.stringify(hashKey)).digest('base64');
    const ttl = (Date.now() / 1000) + (24 * 60 * 60);
    await this.dynamodb.send(new PutItemCommand({
      Item: {
        hash: { S: hash },
        ttl: { N: ttl.toString() },
      },
      TableName: this.tableName,
    }));
  }

  calculateHashKey(obj: any) {
    const hash = createHash('sha256').update(JSON.stringify(obj)).digest('base64');
    return hash;
  }


}