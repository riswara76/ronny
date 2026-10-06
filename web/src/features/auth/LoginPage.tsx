import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { toAppError } from '../../lib/errors';
import { isValidEmail, safeNext } from '../../lib/password';
import { AuthLayout } from '../../components/shells';
import { Alert, Button, Field, PasswordField } from '../../components/ui';
import { useDocumentTitle, useOnline } from '../../app/hooks';

export function LoginPage() {
  useDocumentTitle('Log in');
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const online = useOnline();
  const [email, setEmail] = useState(params.get('email') ?? '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<{ text: string; unverified?: boolean } | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!isValidEmail(email) || !password) {
      setError({ text: 'Please enter your email and password.' });
      return;
    }
    setLoading(true);
    const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (err) {
      const app = toAppError(err);
      setError({ text: app.message, unverified: app.code === 'email_not_confirmed' });
      return;
    }
    navigate(safeNext(params.get('next')), { replace: true });
  }

  return (
    <AuthLayout>
      <h1>Log in</h1>
      <p className="muted">Book DCU sports facilities in a few taps.</p>
      {params.get('reset') === '1' && <Alert tone="success">Your password was updated. Please log in.</Alert>}
      <form onSubmit={submit} noValidate>
        <Field label="Email" type="email" autoComplete="email" inputMode="email" value={email}
          onChange={(e) => setEmail(e.target.value)} required />
        <PasswordField label="Password" value={password} onChange={setPassword} autoComplete="current-password" />
        {error && (
          <Alert tone="danger">
            {error.text}{' '}
            {error.unverified && <Link to={`/verify?email=${encodeURIComponent(email.trim())}`}>Enter verification code</Link>}
          </Alert>
        )}
        <Button type="submit" block size="lg" loading={loading} disabled={!online}>Log in</Button>
      </form>
      <p className="auth-links">
        <Link to="/forgot-password">Forgot password?</Link>
      </p>
      <p className="auth-alt">New to DCU Active? <Link to="/register">Create an account</Link></p>
    </AuthLayout>
  );
}
