import { useAuth } from '@shared/auth.jsx';
import PasswordForm from '@shared/PasswordForm.jsx';
import { Alert, Card, PageHeader, useToast } from '@shared/ui.jsx';
import TransactionPinForm from './TransactionPinForm.jsx';

export default function Security() {
  const { signOut } = useAuth();
  const toast = useToast();
  return (
    <div className="soft-in">
      <PageHeader title="Security" subtitle="Manage your password and transaction PIN." />
      <Card className="max-w-[520px] p-7 mb-6">
        <TransactionPinForm />
      </Card>
      <Card className="max-w-[520px] p-7">
        <h2 className="mb-4 text-xl font-semibold">Change password</h2>
        <PasswordForm onDone={() => { toast('Password changed. Please sign in again.'); setTimeout(signOut, 1400); }} />
      </Card>
      <Alert tone="info" className="mt-6 max-w-[520px]">Sign-in always needs your password and a one-time code sent to your registered mobile number.</Alert>
    </div>
  );
}
