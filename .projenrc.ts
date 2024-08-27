import { GemeenteNijmegenCdkApp } from '@gemeentenijmegen/projen-project-type';
const project = new GemeenteNijmegenCdkApp({
  cdkVersion: '2.1.0',
  defaultReleaseBranch: 'main',
  name: 'mijn-services',
  projenrcTs: true,
  devDeps: [
    '@gemeentenijmegen/projen-project-type',
  ],
  deps: [
    'dotenv',
    '@gemeentenijmegen/aws-constructs',
    'cdk-remote-stack',
  ],
});
project.synth();