import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { MailCheck } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { toAppError } from '../../lib/errors';
import { isValidEmail } from '../../lib/password';
import { AuthLayout } from '../../components/shells';
import { Alert, Button, Field } from '../../components/ui';
import { useDocumentTitle, useOnline } from '../../app/hooks';

export function ForgotPasswordPage() {
  useDocumentTitle('Forgot password');
  const online = useOnline();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!isValidEmail(email)) {
      setError('Please enter a valid email address.');
      return;
    }
    setLoading(true);
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    });
    setLoading(false);
    if (err) setError(toAppError(err).message);
    else setSent(true);
  }

  if (sent) {
    return (
      <AuthLayout>
        <div className="auth-hero-icon" aria-hidden><MailCheck size={36} /></div>
        <h1>Check your email</h1>
        {/* Same message whether or not the account exists (no account enumeration). */}
        <p className="muted">If an account exists for <strong>{email}</strong>, we sent a link and a 6-digit code to reset your password.</p>
        <Link className="btn btn-primary btn-lg btn-block" to={`/auth/reset-password?email=${encodeURIComponent(email.trim())}`}>
          I have a code
        </Link>
        <p className="auth-alt"><Link to="/login">Back to log in</Link></p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <h1>Forgot your password?</h1>
      <p className="muted">Enter your email and we'll send you a link and a code to choose a new password.</p>
      <form onSubmit={submit} noValidate>
        <Field label="Email" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        {error && <Alert tone="danger">{error}</Alert>}
        <Button type="submit" block size="lg" loading={loading} disabled={!online}>Send reset email</Button>
      </form>
      <p className="auth-alt"><Link to="/login">Back to log in</Link></p>
    </AuthLayout>
  );
}
