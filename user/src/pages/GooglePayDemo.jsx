import { useEffect, useRef, useState } from 'react';
import { Alert, Card } from '@shared/ui.jsx';
import { createReadinessRequest, loadGooglePay, runTestCheckout } from '../googlePayTest.js';

export default function GooglePayDemo() {
  const buttonContainer = useRef(null);
  const inFlight = useRef(false);
  const [message, setMessage] = useState('Loading Google Pay…');
  const [tone, setTone] = useState('info');

  useEffect(() => {
    let active = true;
    let button;
    async function setup() {
      try {
        const googlePay = await loadGooglePay();
        if (!active) return;
        const client = new googlePay.PaymentsClient({ environment: 'TEST' });
        const ready = await client.isReadyToPay(createReadinessRequest());
        if (!active) return;
        if (!ready.result) { setMessage('Google Pay is not available in this browser or on this device.'); return; }
        button = client.createButton({
          buttonColor: 'default', buttonType: 'buy',
          onClick: async () => {
            if (inFlight.current) return;
            inFlight.current = true;
            setTone('info'); setMessage('Opening the test payment sheet…');
            try {
              await runTestCheckout(client);
              if (active) { setTone('ok'); setMessage('Test payment method selected. No payment was processed.'); }
            } catch (error) {
              if (active) {
                if (error?.statusCode === 'CANCELED') { setTone('info'); setMessage('Test checkout cancelled.'); }
                else { setTone('danger'); setMessage('Google Pay could not open or complete the test checkout.'); }
              }
            } finally { inFlight.current = false; }
          }
        });
        buttonContainer.current?.replaceChildren(button);
        setMessage('Ready to try the test checkout.');
      } catch {
        if (active) { setTone('danger'); setMessage('Could not load Google Pay. Check your connection or browser settings.'); }
      }
    }
    setup();
    return () => { active = false; button?.remove(); };
  }, []);

  return <section className="mt-8">
    <h2 className="mb-2 text-[24px]">Google Pay card checkout demo</h2>
    <p className="mb-4 text-[14px] text-ink-500">Test mode · Example card payment: $19.99 USD. No real payment is made and no account balance changes. This demo does not support UPI or phone-number payments.</p>
    <Card className="p-6">
      <div ref={buttonContainer} aria-label="Google Pay test checkout" />
      <Alert tone={tone} className="mt-4">{message}</Alert>
    </Card>
  </section>;
}
