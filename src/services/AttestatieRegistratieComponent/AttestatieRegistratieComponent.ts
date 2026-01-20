import { Function } from 'aws-cdk-lib/aws-lambda';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';
import { ArcFunction } from './lambda/arc-function';
import { ServiceLoadBalancer } from '../../constructs/LoadBalancer';

export interface AttestatieRegistratieComponentProps {
  loadbalancer: ServiceLoadBalancer;
}

export class AttestatieRegistratieComponent extends Construct {

  constructor(scope: Construct, id: string, private readonly props: AttestatieRegistratieComponentProps) {
    super(scope, id);
    this.setupLambda();
  }

  private setupLambda() {

    const clientSecret = new Secret(this, 'verid-client-secret', {
      description: 'Client secret VerID issueance',
    });

    const arc = new ArcFunction(this, 'arc-function', {
      environment: {
        VERID_CLIENT_ID: '6828f0a8-1c4c-478b-b60e-3db863a8a42e',
        VERID_CLIENT_SECRET: clientSecret.secretArn,
        VERID_ISSUER_URL: 'https://oauth.ssi.dev.ver.garden',
        ARC_CALLBACK_ENDPOINT: 'https://mijn-services-dev.csp-nijmegen.nl/arc/callback',
      },
    });

    clientSecret.grantRead(arc);
    this.setupRoute(arc);
  }

  private setupRoute(handler: Function) {
    this.props.loadbalancer.attachLambda(handler, '/arc*');
  }

}
