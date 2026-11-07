import { useState } from 'react';
import { Alert, Button, Card, Field, Input, PageHeader } from '@shared/ui.jsx';
import { createUpiLink } from '../upi.js';

export default function Transfer() {
  const [vpa, setVpa] = useState('');
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  function openPayment(event) {
    event.preventDefault();
    try {
      const link = createUpiLink({ vpa, name, amount });
      setError('');
      window.location.href = link;
    } catch (err) { setError(err.message); }
  }
  return <div className="max-w-xl">
    <PageHeader title="Pay with UPI" subtitle="Open a UPI app on your device to complete a payment." />
    <Card className="p-6">
      <form onSubmit={openPayment} className="space-y-4">
        <Field label="Recipient UPI ID" hint="Enter the recipient’s UPI ID, for example name@bank."><Input value={vpa} onChange={e => setVpa(e.target.value)} autoComplete="off" required /></Field>
        <Field label="Recipient name"><Input value={name} onChange={e => setName(e.target.value)} maxLength={100} required /></Field>
        <Field label="Amount (INR)"><Input value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal" required /></Field>
        <Alert>{error}</Alert>
        <Button type="submit">Open UPI app</Button>
      </form>
    </Card>
    <Alert tone="info" className="mt-4">Choose an installed UPI app, such as Google Pay, PhonePe or Paytm. Check the recipient and status in that app. This portal cannot verify the payment or update your bank balance.</Alert>
  </div>;
}
