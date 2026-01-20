import { Function } from 'aws-cdk-lib/aws-lambda';
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
    const arc = new ArcFunction(this, 'arc-function', {});
    this.setupRoute(arc);
  }

  private setupRoute(handler: Function) {
    this.props.loadbalancer.attachLambda(handler, '/arc*');
  }

}
