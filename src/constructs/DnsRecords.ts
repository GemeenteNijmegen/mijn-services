import { createHash } from 'crypto';
import { CnameRecord, IHostedZone } from 'aws-cdk-lib/aws-route53';
import { Construct } from 'constructs';

interface DnsRecordsProps {
  cnameRecords?: Record<string, string>;
  hostedzone: IHostedZone;
}

export class DnsRecords extends Construct {
  constructor(scope: Construct, id: string, props: DnsRecordsProps) {
    super(scope, id);

    if (props.cnameRecords) {
      this.addCnameRecords(props.cnameRecords, props.hostedzone);
    }
  }

  private addCnameRecords(records: Record<string, string>, hostedzone: IHostedZone) {
    for (const [name, value] of Object.entries(records)) {
      const hash = createHash('sha256').update(name+value).digest('hex').substring(5);
      new CnameRecord(this, `cname-${hash}`, {
        recordName: name,
        domainName: value,
        zone: hostedzone,
      });
    }
  }
}