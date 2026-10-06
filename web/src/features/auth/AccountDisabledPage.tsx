import { Link } from 'react-router-dom';
import { ShieldOff } from 'lucide-react';
import { AuthLayout } from '../../components/shells';
import { Button } from '../../components/ui';
import { useAuth } from '../../app/auth';
import { useDocumentTitle } from '../../app/hooks';
import { MESSAGES } from '../../lib/errors';

export function AccountDisabledPage() {
  useDocumentTitle('Account disabled');
  const { session, signOut } = useAuth();
  return (
    <AuthLayout>
      <div className="auth-hero-icon danger" aria-hidden><ShieldOff size={36} /></div>
      <h1>Account disabled</h1>
      <p className="muted" role="alert">{MESSAGES.ACCOUNT_DISABLED}</p>
      {session ? (
        <Button block variant="secondary" onClick={() => void signOut()}>Sign out</Button>
      ) : (
        <p className="auth-alt"><Link to="/login">Back to log in</Link></p>
      )}
    </AuthLayout>
  );
}
