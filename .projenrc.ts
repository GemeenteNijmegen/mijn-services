import { GemeenteNijmegenCdkApp } from '@gemeentenijmegen/projen-project-type';
const project = new GemeenteNijmegenCdkApp({
  cdkVersion: '2.1.0',
  defaultReleaseBranch: 'main',
  name: 'mijn-services',
  projenrcTs: true,
  devDeps: [
    '@gemeentenijmegen/projen-project-type',
    '@types/aws-lambda',
    '@types/pg',
  ],
  deps: [
    'dotenv',
    '@gemeentenijmegen/aws-constructs',
    '@gemeentenijmegen/utils',
    '@gemeentenijmegen/apigateway-http',
    'cdk-remote-stack',
    'pg', // Postgres client 🐘
    'zod',
  ],
});
project.synth();