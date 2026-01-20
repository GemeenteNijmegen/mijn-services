import { GemeenteNijmegenCdkApp } from '@gemeentenijmegen/projen-project-type';
const project = new GemeenteNijmegenCdkApp({
  cdkVersion: '2.1.0',
  defaultReleaseBranch: 'main',
  name: 'mijn-services',
  projenrcTs: true,
  releaseWorkflowEnv: {
    VER_ID_GH_TOKEN: '${{ secrets.VER_ID_GH_TOKEN }}',
  },
  buildWorkflowOptions: {
    env: {
      VER_ID_GH_TOKEN: '${{ secrets.VER_ID_GH_TOKEN }}',
    },
  },
  devDeps: [
    '@gemeentenijmegen/projen-project-type',
    '@types/pg',
    '@types/jsonwebtoken',
    'aws-sdk-client-mock',
  ],
  deps: [
    'dotenv',
    '@types/aws-lambda',
    '@gemeentenijmegen/aws-constructs',
    '@gemeentenijmegen/utils',
    '@gemeentenijmegen/apigateway-http',
    '@gemeentenijmegen/attestatie-registratie-component',
    'cdk-remote-stack',
    'pg', // Postgres client 🐘
    'zod',
    'jsonwebtoken',
    'dotenv',
    '@aws-lambda-powertools/logger',
    '@aws-sdk/client-sqs',
    '@aws-sdk/client-dynamodb',
    '@aws-sdk/client-ec2',
    '@aws-lambda-powertools/idempotency',
    '@aws-lambda-powertools/tracer',
    '@middy/core',
    '@aws-lambda-powertools/batch',
  ],
  jestOptions: {
    jestConfig: {
      setupFiles: ['dotenv/config'],
    },
  },
  tsconfig: {
    compilerOptions: {
      isolatedModules: true,
    },
  },
});

/**
 * Supress the 'dependency should be included in the project dependencies' error.
 */
project.eslint?.addOverride({
  rules: {
    'import/no-extraneous-dependencies': ['off'],
  },
  files: ['*.ts'],
});

project.synth();
