#!/usr/bin/env bash
#
# Manually run the standalone objects migration task in dev.
#
# It resolves the CDK stack outputs by their (stable) Description strings, so you
# do NOT need to know the generated stack name or output keys. It does NOT scale
# any service down and does NOT snapshot anything — this is the safe, idempotent
# "does the task def even work" check against an already-migrated dev DB.
#
# Usage:
#   bash /tmp/run-objects-migrate.sh          # print the resolved run-task command
#   bash /tmp/run-objects-migrate.sh run      # actually run it
#
# Requires: awscli v2 + jq, with credentials for the dev account already active.

set -euo pipefail

REGION="${AWS_REGION:-eu-central-1}"

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

if [ "${1:-}" = "run" ]; then
  echo "Running migration task..." >&2
  "${RUN_TASK[@]}"
  echo >&2
  echo "Task started. Watch it in the ECS console (or 'aws ecs describe-tasks')." >&2
  echo "Success = the 'migrate' container exits 0 and its log shows 'No migrations to apply.'" >&2
else
  echo "# Dry print only — re-run with 'run' to execute:" >&2
  printf '%q ' "${RUN_TASK[@]}"
  echo
fi
