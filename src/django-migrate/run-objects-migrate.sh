#!/usr/bin/env bash
#
# Manually run (and watch) the standalone objects migration task in dev.
#
# It resolves the CDK stack outputs by their (stable) Description strings, so you
# do NOT need to know the generated stack name or output keys. It does NOT scale
# any service down and does NOT snapshot anything — this is the safe, idempotent
# "does the task def even work" check against an already-migrated dev DB.
#
# Usage:
#   bash src/django-migrate/run-objects-migrate.sh          # print the run-task command, run nothing
#   bash src/django-migrate/run-objects-migrate.sh run      # run it, auto-tail logs, report exit code
#   bash src/django-migrate/run-objects-migrate.sh logs ID  # tail an already-running task (id or ARN)
#
# Requires: awscli v2 + jq, with credentials for the dev account already active.

set -euo pipefail

REGION="${AWS_REGION:-eu-central-1}"

# awslogs stream name = <streamPrefix>/<containerName>/<taskId>; both are "migrate".
STREAM_PREFIX="migrate/migrate"

echo "Resolving migration task outputs in region ${REGION}..." >&2
OUTPUTS="$(aws cloudformation describe-stacks --region "${REGION}" \
  --query 'Stacks[].Outputs[]' --output json)"

lookup() {
  # $1 = the CfnOutput Description to match
  echo "${OUTPUTS}" | jq -r --arg d "$1" '[.[] | select(.Description==$d)][0].OutputValue // empty'
}

CLUSTER="$(lookup 'django-migrate ECS_CLUSTER')"
TASKDEF="$(lookup 'django-migrate MIGRATION_TASK_DEFINITION (family:revision)')"
SUBNETS="$(lookup 'django-migrate SUBNETS')"
SECURITY_GROUPS="$(lookup 'django-migrate SECURITY_GROUPS')"
LOG_GROUP="$(lookup 'CloudWatch log group for the migration task')"

# Tail the migrate container's logs for a given task id until interrupted.
tail_logs() {
  local task_id="${1##*/}"   # accept a full task ARN too
  if [ -z "${LOG_GROUP}" ]; then
    echo "WARN: could not resolve the log group output; skipping log tail." >&2
    return 0
  fi
  echo "Tailing logs: ${LOG_GROUP}  stream ${STREAM_PREFIX}/${task_id}" >&2
  aws logs tail "${LOG_GROUP}" --region "${REGION}" --follow --since 5m \
    --format short --log-stream-name-prefix "${STREAM_PREFIX}/${task_id}"
}

# Subcommand: just tail an already-running task's logs.
if [ "${1:-}" = "logs" ]; then
  [ -n "${2:-}" ] || { echo "Usage: $0 logs <taskId|taskArn>" >&2; exit 1; }
  tail_logs "$2"
  exit 0
fi

missing=0
for pair in "ECS_CLUSTER=${CLUSTER}" "TASK_DEFINITION=${TASKDEF}" \
            "SUBNETS=${SUBNETS}" "SECURITY_GROUPS=${SECURITY_GROUPS}"; do
  if [ -z "${pair#*=}" ]; then
    echo "ERROR: could not resolve ${pair%%=*} from stack outputs." >&2
    missing=1
  fi
done
[ "${missing}" -eq 0 ] || { echo "Is the migrationImage-enabled stack deployed to this account/region?" >&2; exit 1; }

echo "  cluster:         ${CLUSTER}" >&2
echo "  task definition: ${TASKDEF}" >&2
echo "  subnets:         ${SUBNETS}" >&2
echo "  security groups: ${SECURITY_GROUPS}" >&2
echo "  log group:       ${LOG_GROUP:-<not found>}" >&2
echo >&2

# subnets output is already comma-separated; wrap both lists in [ ] for awsvpc.
NETWORK_CONFIG="awsvpcConfiguration={subnets=[${SUBNETS}],securityGroups=[${SECURITY_GROUPS}],assignPublicIp=DISABLED}"

RUN_TASK=(aws ecs run-task
  --region "${REGION}"
  --cluster "${CLUSTER}"
  --task-definition "${TASKDEF}"
  --launch-type FARGATE
  --started-by "manual-migrate-verify"
  --network-configuration "${NETWORK_CONFIG}")

if [ "${1:-}" != "run" ]; then
  echo "# Dry print only — re-run with 'run' to execute:" >&2
  printf '%q ' "${RUN_TASK[@]}"
  echo
  exit 0
fi

echo "Running migration task..." >&2
TASK_JSON="$("${RUN_TASK[@]}")"

if [ "$(echo "${TASK_JSON}" | jq -r '.failures | length')" != "0" ]; then
  echo "ERROR: run-task returned failures:" >&2
  echo "${TASK_JSON}" | jq '.failures' >&2
  exit 1
fi

TASK_ARN="$(echo "${TASK_JSON}" | jq -r '.tasks[0].taskArn')"
TASK_ID="${TASK_ARN##*/}"
echo "Task started: ${TASK_ARN}" >&2
echo >&2

# Auto-tail: follow logs in the background, stop the tail once the task stops.
LOGS_PID=""
if [ -n "${LOG_GROUP}" ]; then
  tail_logs "${TASK_ID}" &
  LOGS_PID=$!
fi
cleanup() { [ -n "${LOGS_PID}" ] && kill "${LOGS_PID}" 2>/dev/null || true; }
trap cleanup EXIT

echo "Waiting for the task to stop..." >&2
aws ecs wait tasks-stopped --region "${REGION}" --cluster "${CLUSTER}" --tasks "${TASK_ARN}" || true

sleep 3            # let the last log lines flush
cleanup; trap - EXIT
echo >&2

DESC="$(aws ecs describe-tasks --region "${REGION}" --cluster "${CLUSTER}" --tasks "${TASK_ARN}")"
EXIT_CODE="$(echo "${DESC}" | jq -r '.tasks[0].containers[] | select(.name=="migrate") | .exitCode // "none"')"
STOP_REASON="$(echo "${DESC}" | jq -r '.tasks[0].stoppedReason // "unknown"')"

echo "----------------------------------------" >&2
echo "migrate exitCode:  ${EXIT_CODE}" >&2
echo "stoppedReason:     ${STOP_REASON}" >&2
if [ "${EXIT_CODE}" = "0" ]; then
  echo "✅ migrate exited 0 — expected 'No migrations to apply.' above." >&2
  exit 0
else
  echo "❌ migrate did not exit 0. Re-tail with: $0 logs ${TASK_ID}" >&2
  exit 1
fi
