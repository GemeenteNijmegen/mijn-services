import { BlockPublicAccess, Bucket, IBucket } from "aws-cdk-lib/aws-s3";
import { BucketDeployment, Source } from "aws-cdk-lib/aws-s3-deployment";
import { Construct } from "constructs";
import { Configurable } from "../ConfigurationInterfaces";
import { IGrantable } from "aws-cdk-lib/aws-iam";

interface ConfigurationStoreProps extends Configurable {};

/**
 * Responsible for saving configuration files to a location accessible to
 * fargate tasks, so (Django) config files can be loaded.
 */
export class OpenConfigurationStore extends Construct {
  readonly bucket: Bucket;
  constructor(scope: Construct, id: string, props: ConfigurationStoreProps) {
    super(scope, id);
    
    this.bucket = this.setupConfigBucket();
    this.deployConfig(this.bucket, props.configuration.branch);
  }


  setupConfigBucket() {
    return new Bucket(this, 'configbucket', {
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      versioned: true,
    });
  }

  grantReadConfig(grantee: IGrantable, serviceName: string) {
    this.bucket.grantRead(grantee, `${serviceName}/*`);
  }

  private deployConfig(bucket: IBucket, environment: string) {
    new BucketDeployment(this, 'bucketdeploy', {
      destinationBucket: bucket,
      sources: [
        Source.asset(`{src/config/${environment}`)
      ]
    });
  }

}
