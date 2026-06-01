# OperatingHourWatcher

Automatically scales all ECS services in a cluster to zero outside configured operating hours, and restores them when operating hours resume. Useful for reducing costs on non-production environments.

## How it works

A Lambda function runs at **5 minutes past every hour** (UTC). Each run it checks whether the current UTC hour falls within the configured operating window:

```
outside hours  →  save each service's desired count to DynamoDB, then set all to 0
inside hours   →  restore desired counts from DynamoDB, then delete the saved records
```

Both paths are **idempotent**: if services are already stopped (DynamoDB has records) or already running (DynamoDB is empty), the Lambda exits early without making ECS calls.

### State storage

A DynamoDB table keyed on `(clusterArn, serviceArn)` stores the desired count of each service before it was stopped. This survives Lambda cold starts and multiple invocations, and is the authoritative signal for whether a shutdown has already occurred.

### Overnight ranges

`startHour` and `endHour` are inclusive/exclusive UTC hours on a 24-hour clock. Ranges that span midnight (e.g. `startHour: 22, endHour: 6`) are supported.

| Example                     | Behaviour               |
|-----------------------------|-------------------------|
| `startHour: 8, endHour: 18` | Running 08:05–17:05 UTC |
| `startHour: 22, endHour: 6` | Running 22:05–05:05 UTC |

## Usage

```typescript
new OperatingHourWatcher(this, 'OperatingHours', {
  cluster: platform.cluster,
  operatingHours: {
    startHour: 8,   // 08:00 UTC
    endHour: 18,    // 18:00 UTC
  },
});
```

The construct accepts an `ICluster` directly, making it independent of the rest of this project's infrastructure and easy to extract into a separate package later.

## IAM permissions granted

| Action                 | Scope                                                  |
|------------------------|--------------------------------------------------------|
| `ecs:ListServices`     | The cluster ARN                                        |
| `ecs:DescribeServices` | All services in the cluster (`service/CLUSTER_NAME/*`) |
| `ecs:UpdateService`    | All services in the cluster (`service/CLUSTER_NAME/*`) |
| DynamoDB read/write    | The construct's own table                              |

## Files

| File                                | Purpose                                                           |
|-------------------------------------|-------------------------------------------------------------------|
| `OperatingHourWatcher.ts`           | CDK construct — DynamoDB table, Lambda, EventBridge schedule, IAM |
| `operatingHoursWatcher.lambda.ts`   | Lambda handler — stop/start logic                                 |
| `operatingHoursWatcher-function.ts` | Generated CDK `Function` wrapper (do not edit manually)           |
| `test/`                             | Jest unit tests using `aws-sdk-client-mock`                       |




## Expension plans:
- List of EC2 instances that have operating hours as well
- Override option