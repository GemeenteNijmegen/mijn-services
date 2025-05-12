import { PermissionsBoundaryAspect } from '@gemeentenijmegen/aws-constructs';
import { Aspects, CfnParameter, Stack, StackProps, Tags, pipelines } from 'aws-cdk-lib';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';
import { Configurable } from './Configuration';
import { MijnServicesStage } from './MijnServicesStage';
import { ParameterStage } from './ParameterStage';
import { Statics } from './Statics';

export interface PipelineStackProps extends StackProps, Configurable { }

/**
 * The pipeline runs in a build environment, and is responsible for deploying
 * Cloudformation stacks to the workload account. The pipeline will first build
 * and synth the project, then deploy (self-mutating if necessary).
 */
export class PipelineStack extends Stack {
  branchName: string;

  constructor(scope: Construct, id: string, props: PipelineStackProps) {
    super(scope, id, props);
    Tags.of(this).add('cdkManaged', 'yes');
    Tags.of(this).add('Project', Statics.projectName);
    Aspects.of(this).add(new PermissionsBoundaryAspect());
    this.branchName = props.configuration.branch;

    /**
     * INSTRUCTIONS:
     * On first deploy, providing a connectionArn param to `cdk deploy` is required, so the
     * codestarconnection can be setup. This connection is responsible for further deploys
     * triggering from a commit to the specified branch on Github.
     */
    const connectionArn = new CfnParameter(this, 'connectionArn');
    const source = this.connectionSource(connectionArn);

    const pipeline = this.pipeline(source, props);

    // Parameter stage
    const parameters = new ParameterStage(this, `${Statics.projectName}-parameters`, {
      env: props.configuration.deploymentEnvironment,
      configuration: props.configuration,
    });
    pipeline.addStage(parameters);

    // API stage
    const api = new MijnServicesStage(this, Statics.projectName, {
      env: props.configuration.deploymentEnvironment,
      configuration: props.configuration,
    });
    pipeline.addStage(api);

  }

  pipeline(source: pipelines.CodePipelineSource, props: PipelineStackProps): pipelines.CodePipeline {
    const dockerHub = new Secret(this, 'docker-credentials', {
      description: `Docker credentials for ${Statics.projectName} (${props.configuration.branch})`,
    });

    const synthStep = new pipelines.ShellStep('Synth', {
      input: source,
      env: {
        BRANCH_NAME: this.branchName,
      },
      installCommands: [
        // We set the node version to the latest 22.x.x release as the middy package used in lambdas requires >=20.
        'n 22',
      ],
      commands: [
        'yarn install --frozen-lockfile',
        'npx projen build',
      ],
    });

    const pipelineName = `${Statics.projectName}-${props.configuration.branch}`;
    const pipeline = new pipelines.CodePipeline(this, pipelineName, {
      pipelineName: pipelineName,
      crossAccountKeys: true,
      synth: synthStep,
      dockerCredentials: [pipelines.DockerCredential.dockerHub(dockerHub)],
    });
    return pipeline;
  }

  /**
   * We use a codestarconnection to trigger automatic deploys from Github
   *
   * The value for this ARN can be found in the CodePipeline service under [settings->connections](https://eu-central-1.console.aws.amazon.com/codesuite/settings/connections?region=eu-central-1)
   * Usually this will be in the build-account.
   *
   * @param connectionArn the ARN for the codestarconnection.
   * @returns
   */
  private connectionSource(connectionArn: CfnParameter): pipelines.CodePipelineSource {
    return pipelines.CodePipelineSource.connection(Statics.projectRepo, this.branchName, {
      connectionArn: connectionArn.valueAsString,
    });
  }
}
