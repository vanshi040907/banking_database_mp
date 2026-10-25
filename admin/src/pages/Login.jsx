import { useAuth } from '@shared/auth.jsx';
import LoginScreen from '@shared/LoginScreen.jsx';

export default function Login() {
  const { signIn } = useAuth();
  return (
    <LoginScreen
      art="architecture" artWidth="52%" audience="Staff sign in" sub="Staff" idField="emp_id" idLabel="Employee ID" idPlaceholder="e.g. 3"
      loginPath="/auth/staff/login" verifyPath="/auth/staff/verify" onToken={signIn}
      hints={<>Demo staff IDs <span className="tnum">1</span> to <span className="tnum">8</span>, password <span className="tnum">Test@1234</span>.
        Each ID has a different role, so you will see different screens.</>}
    />
  );
}
