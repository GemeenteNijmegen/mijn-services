import { AttestatieRegestratieComponent, ProductenService, VerIdAttestationService } from '@gemeentenijmegen/attestatie-registratie-component';
import { AWS } from '@gemeentenijmegen/utils';
import { ALBEvent, ALBResult } from 'aws-lambda';
/**
 * Very minimal setup to test full cycle
 * @param event
 * @returns
 */
export async function handler(event: ALBEvent): Promise<ALBResult> {
  console.log(event);
  const arc = new AttestatieRegestratieComponent({
    attestationService: new VerIdAttestationService({
      client_id: process.env.VERID_CLIENT_ID!,
      client_secret: await AWS.getSecret(process.env.VERID_CLIENT_SECRET!),
      issuerUri: process.env.VERID_ISSUER_URL!,
      redirectUri: process.env.ARC_CALLBACK_ENDPOINT!,
    }),
    productenService: new ProductenService(),
  });
  return {
    statusCode: 200,
    body: JSON.stringify({ message: arc.hello() }),
    headers: {
      'Content-Type': 'application/json',
    },
  };
}