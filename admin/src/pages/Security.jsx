import { useAuth } from '@shared/auth.jsx';
import PasswordForm from '@shared/PasswordForm.jsx';
import { Alert, Card, PageHeader, useToast } from '@shared/ui.jsx';

export default function Security() {
  const { signOut } = useAuth();
  const toast = useToast();
  return (
    <div className="soft-in">
      <PageHeader title="Security" subtitle="Change your password. You will be signed out afterwards." />
      <Card className="max-w-[520px] p-7">
        <PasswordForm onDone={() => { toast('Password changed. Please sign in again.'); setTimeout(signOut, 1400); }} />
      </Card>
      <Alert tone="info" className="mt-6 max-w-[520px]">Every sign-in needs your password and a one-time code sent to your registered mobile number.</Alert>
    </div>
  );
}
