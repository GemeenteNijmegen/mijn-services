import { aws_ec2 as ec2, aws_rds as rds } from 'aws-cdk-lib';
import { Construct } from 'constructs';

export interface BastionHostProps {
  vpc: ec2.IVpc;
  databases: rds.DatabaseInstance[];
}

export class BastionHost extends Construct {
  constructor(scope: Construct, id: string, props: BastionHostProps) {
    super(scope, id);

    const host = new ec2.BastionHostLinux(this, 'bastion', {
      vpc: props.vpc,
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.NANO),
      subnetSelection: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      blockDevices: [{
        deviceName: '/dev/xvda',
        volume: ec2.BlockDeviceVolume.ebs(8, { encrypted: true }),
      }],
    });

    for (const db of props.databases) {
      db.connections.allowFrom(host, ec2.Port.tcp(5432));
    }
  }
}
