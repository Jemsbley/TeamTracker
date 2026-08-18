import { Navigate } from 'react-router-dom';

// Sign-up and sign-in are unified under Google ("Continue with Google"
// creates the account if it doesn't exist), so this route just redirects.
export default function SignupPage() {
  return <Navigate to="/login" replace />;
}
