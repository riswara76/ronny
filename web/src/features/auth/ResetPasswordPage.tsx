import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { toAppError } from '../../lib/errors';
import { isStrongPassword, isValidEmail } from '../../lib/password';
import { AuthLayout } from '../../components/shells';
import { Alert, Button, Field, PasswordField } from '../../components/ui';
import { useDocumentTitle, useOnline } from '../../app/hooks';

/**
 * Reached from the reset email link (?token_hash=…&type=recovery) or with a 6-digit code (?email=…).
 * The one-time token is redeemed only when the person submits the new password.
 */
export function ResetPasswordPage() {
  useDocumentTitle('Choose a new password');
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const online = useOnline();
  const tokenHash = params.get('token_hash');
  const [email, setEmail] = useState(params.get('email') ?? '');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState<{ text: string; expired?: boolean } | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!tokenHash && (!isValidEmail(email) || !/^\d{6}$/.test(code))) {
      setError({ text: 'Please enter your email and the 6-digit code from the email.' });
      return;
    }
    if (!isStrongPassword(password)) {
      setError({ text: 'Password does not meet all the requirements.' });
      return;
    }
    if (password !== confirm) {
      setError({ text: 'Passwords do not match.' });
      return;
    }
    setLoading(true);
    if (!verified) {
      const { error: vErr } = tokenHash
        ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' })
        : await supabase.auth.verifyOtp({ email: email.trim(), token: code, type: 'recovery' });
      if (vErr) {
        setLoading(false);
        setError({ text: 'This reset link or code is invalid or has expired.', expired: true });
        return;
      }
      setVerified(true);
    }
    const { data: updated, error: uErr } = await supabase.auth.updateUser({ password });
    if (uErr) {
      setLoading(false);
      setError({ text: toAppError(uErr).message });
      return;
    }
    // Start fresh: sign out of the recovery session and log in with the new password.
    // The link flow carries no email in the URL, so take it from the recovery session.
    const accountEmail = updated.user?.email ?? email.trim();
    await supabase.auth.signOut();
    setLoading(false);
    navigate(`/login?reset=1${accountEmail ? `&email=${encodeURIComponent(accountEmail)}` : ''}`, { replace: true });
  }

  return (
    <AuthLayout>
      <h1>Choose a new password</h1>
      <form onSubmit={submit} noValidate>
        {!tokenHash && (
          <>
            <Field label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <Field label="Reset code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} className="code-input" />
          </>
        )}
        <PasswordField label="New password" value={password} onChange={setPassword} autoComplete="new-password" showRules />
        <PasswordField label="Confirm new password" value={confirm} onChange={setConfirm} autoComplete="new-password" />
        {error && (
          <Alert tone="danger">
            {error.text} {error.expired && <Link to="/forgot-password">Request a new one</Link>}
          </Alert>
        )}
        <Button type="submit" block size="lg" loading={loading} disabled={!online}>Save new password</Button>
      </form>
      <p className="auth-alt"><Link to="/login">Back to log in</Link></p>
    </AuthLayout>
  );
}
