import { AttestatieRegestratieComponent } from '@gemeentenijmegen/attestatie-registratie-component';

/**
 * Very minimal setup to test full cycle
 * @param event
 * @returns
 */
export async function handler(event: any) {
  console.log(event);
  const arc = new AttestatieRegestratieComponent({});
  return {
    statusCode: 200,
    body: JSON.stringify({ message: arc.hello() }),
  };

}