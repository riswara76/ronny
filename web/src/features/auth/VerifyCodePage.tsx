import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { MailCheck } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { toAppError } from '../../lib/errors';
import { isValidEmail } from '../../lib/password';
import { AuthLayout } from '../../components/shells';
import { Alert, Button, Field } from '../../components/ui';
import { useAuth } from '../../app/auth';
import { useDocumentTitle, useOnline } from '../../app/hooks';

/** Resend button with a cooldown (Supabase also rate-limits on the server). */
export function useResend(type: 'signup') {
  const [cooldown, setCooldown] = useState(0);
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(t);
  }, [cooldown]);
  async function resend(email: string) {
    setMessage(null);
    if (!isValidEmail(email)) {
      setMessage({ tone: 'danger', text: 'Please enter a valid email address.' });
      return;
    }
    const { error } = await supabase.auth.resend({
      type, email: email.trim(), options: { emailRedirectTo: `${window.location.origin}/auth/confirm` },
    });
    if (error) setMessage({ tone: 'danger', text: toAppError(error).message });
    else {
      setMessage({ tone: 'success', text: 'We sent a new verification email.' });
      setCooldown(60);
    }
  }
  return { cooldown, message, resend };
}

export function VerifyCodePage() {
  useDocumentTitle('Verify your email');
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const online = useOnline();
  const { session } = useAuth();
  const [email, setEmail] = useState(params.get('email') ?? '');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { cooldown, message, resend } = useResend('signup');

  if (session && !loading) return <Navigate to="/" replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!isValidEmail(email) || !/^\d{6}$/.test(code.trim())) {
      setError('Please enter your email and the 6-digit code from the email.');
      return;
    }
    setLoading(true);
    const { error: err } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'signup' });
    if (err) {
      setLoading(false);
      setError(toAppError(err).message);
      return;
    }
    // Keep `loading` set so the "already signed in" redirect above doesn't race this navigation.
    navigate('/?welcome=1', { replace: true });
  }

  return (
    <AuthLayout>
      <div className="auth-hero-icon" aria-hidden><MailCheck size={36} /></div>
      <h1>Check your email</h1>
      <p className="muted">
        {params.get('sent') ? 'We sent a verification email' : 'Your verification email was sent'}
        {email ? <> to <strong>{email}</strong></> : ''}. Open the link in the email, or enter the 6-digit code here.
      </p>
      <form onSubmit={submit} noValidate>
        {!params.get('email') && (
          <Field label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        )}
        <Field label="Verification code" inputMode="numeric" autoComplete="one-time-code" maxLength={6}
          pattern="[0-9]{6}" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          className="code-input" />
        {error && <Alert tone="danger">{error}</Alert>}
        <Button type="submit" block size="lg" loading={loading} disabled={!online}>Verify email</Button>
      </form>
      <div className="resend">
        <p className="muted">Didn't get it? Check your spam folder or</p>
        <Button variant="secondary" onClick={() => void resend(email)} disabled={cooldown > 0 || !online}>
          {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend verification email'}
        </Button>
        {message && <Alert tone={message.tone}>{message.text}</Alert>}
      </div>
      <p className="auth-alt">Already verified? <Link to="/login">Log in</Link></p>
    </AuthLayout>
  );
}
