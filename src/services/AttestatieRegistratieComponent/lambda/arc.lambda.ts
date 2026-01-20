import { AttestatieRegestratieComponent, ProductenService, VerIdAttestationService } from '@gemeentenijmegen/attestatie-registratie-component';
import { AWS } from '@gemeentenijmegen/utils';
import { ALBEvent, ALBResult } from 'aws-lambda';
import { randomUUID } from 'crypto';
/**
 * Very minimal setup to test full cycle
 * @param event
 * @returns
 */
export async function handler(event: ALBEvent): Promise<ALBResult> {
  const arc = new AttestatieRegestratieComponent({
    attestationService: new VerIdAttestationService({
      client_id: process.env.VERID_CLIENT_ID!,
      client_secret: await AWS.getSecret(process.env.VERID_CLIENT_SECRET!),
      issuerUri: process.env.VERID_ISSUER_URL!,
      redirectUri: process.env.ARC_CALLBACK_ENDPOINT!,
    }),
    productenService: new ProductenService(),
  });

  if (event.path.includes('/start')) {
    return start(event, arc);
  };

  if (event.path.includes('/callback')) {
    return callback(event, arc);
  };

  return {
    statusCode: 400,
    body: JSON.stringify({ error: 'Request not handled' }),
  };

}


async function start(event: ALBEvent, arc: AttestatieRegestratieComponent): Promise<ALBResult> {
  console.log('Handling start...', event);

  const redirectUri = arc.start({
    id: randomUUID(),
    type: 'producten',
  });

  return {
    statusCode: 200,
    body: JSON.stringify({ url: redirectUri }),
    headers: {
      'Content-Type': 'application/json',
    },
  };
}

async function callback(event: ALBEvent, arc: AttestatieRegestratieComponent): Promise<ALBResult> {
  console.log('Handling callback...', event);

  arc.callback({
    id: randomUUID(),
    type: 'producten',
  });
  return {
    statusCode: 400,
    body: JSON.stringify({ error: 'this call is not yet implemented' }),
  };
}