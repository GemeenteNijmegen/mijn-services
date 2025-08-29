import { Repository } from 'aws-cdk-lib/aws-ecr';
import { AccessKey, User } from 'aws-cdk-lib/aws-iam';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

export class EcrRepository extends Construct {

  /**
   * Creates a ECR repository and a IAM user including credentials that
   * is allowed to push and pull from this repository.
   * @param scope
   * @param id
   * @param usage
   */
  constructor(scope: Construct, id: string, usage: string) {
    super(scope, id);
    this.setupEcrRepository(usage);
  }

  private setupEcrRepository(usage: string) {
    const repo = new Repository(this, 'repository');
    const user = new User(this, 'repository-user');
    const credentials = new AccessKey(this, 'repository-user-credentials', {
      user: user,
    });
    new Secret(this, 'repository-user-secret', {
      description: `Secret access key for ecr repository user (${usage})`,
      secretStringValue: credentials.secretAccessKey,
    });
    repo.grantPullPush(user);
  }
}