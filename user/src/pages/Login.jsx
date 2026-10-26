import { useAuth } from '@shared/auth.jsx';
import LoginScreen from '@shared/LoginScreen.jsx';

export default function Login() {
  const { signIn } = useAuth();
  return (
    <LoginScreen
      art="lakeside" audience="Customer sign in" idField="accNo" idLabel="Account number" idPlaceholder="10-digit account number"
      loginPath="/auth/customer/login" expectType="CUSTOMER" onToken={signIn}
      wrongPortal="This is the customer sign in. Staff should use the employee portal."
      hints={<>Demo accounts <span className="tnum">1000000001</span> to <span className="tnum">1000000004</span>, password <span className="tnum">Test@1234</span>.</>}
    />
  );
}
