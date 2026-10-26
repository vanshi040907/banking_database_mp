import { useAuth } from '@shared/auth.jsx';
import LoginScreen from '@shared/LoginScreen.jsx';

export default function Login() {
  const { signIn } = useAuth();
  return (
    <LoginScreen
      art="architecture" artWidth="52%" audience="Staff sign in" sub="Staff" idField="empId" idLabel="Employee ID" idPlaceholder="e.g. 3"
      loginPath="/auth/employee/login" expectType="EMPLOYEE" onToken={signIn}
      wrongPortal="This is the staff sign in. Customers should use the customer portal."
      hints={<>Demo staff IDs <span className="tnum">1</span> to <span className="tnum">8</span>, password <span className="tnum">Test@1234</span>.</>}
    />
  );
}
