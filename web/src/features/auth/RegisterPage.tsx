import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { toAppError } from '../../lib/errors';
import { isStrongPassword, isValidEmail } from '../../lib/password';
import { AuthLayout } from '../../components/shells';
import { Alert, Button, Field, PasswordField } from '../../components/ui';
import { useDocumentTitle, useOnline } from '../../app/hooks';

export function RegisterPage() {
  useDocumentTitle('Create account');
  const navigate = useNavigate();
  const online = useOnline();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const errors = {
    name: name.trim().length < 2 ? 'Please enter your full name.' : name.trim().length > 100 ? 'Name is too long.' : '',
    email: !isValidEmail(email) ? 'Please enter a valid email address.' : '',
    password: !isStrongPassword(password) ? 'Password does not meet all the requirements.' : '',
    confirm: confirm !== password || !confirm ? 'Passwords do not match.' : '',
  };
  const valid = !Object.values(errors).some(Boolean);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    setError(null);
    if (!valid) return;
    setLoading(true);
    const { error: err } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { full_name: name.trim() },
        emailRedirectTo: `${window.location.origin}/auth/confirm`,
      },
    });
    setLoading(false);
    if (err) {
      setError(toAppError(err).message);
      return;
    }
    navigate(`/verify?email=${encodeURIComponent(email.trim())}&sent=1`, { replace: true });
  }

  const show = (k: keyof typeof errors) => (touched ? errors[k] || undefined : undefined);

  return (
    <AuthLayout>
      <h1>Create your account</h1>
      <p className="muted">For DCU participants and trainers. We'll email you a link and a code to verify your address.</p>
      <form onSubmit={submit} noValidate>
        <Field label="Full name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} error={show('name')} required />
        <Field label="Email" type="email" autoComplete="email" inputMode="email" value={email}
          onChange={(e) => setEmail(e.target.value)} error={show('email')} required />
        <PasswordField label="Password" value={password} onChange={setPassword} autoComplete="new-password" showRules error={show('password')} />
        <PasswordField label="Confirm password" value={confirm} onChange={setConfirm} autoComplete="new-password" error={show('confirm')} />
        {error && <Alert tone="danger">{error}</Alert>}
        <Button type="submit" block size="lg" loading={loading} disabled={!online}>Create account</Button>
      </form>
      <p className="auth-alt">Already have an account? <Link to="/login">Log in</Link></p>
    </AuthLayout>
  );
}
