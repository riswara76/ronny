import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle2, MailCheck, XCircle } from 'lucide-react';
import type { EmailOtpType } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import { AuthLayout } from '../../components/shells';
import { Alert, Button, Field } from '../../components/ui';
import { useDocumentTitle, useOnline } from '../../app/hooks';
import { useResend } from './VerifyCodePage';

type State = 'ready' | 'verifying' | 'success' | 'invalid';

/**
 * Landing page of the verification link: /auth/confirm?token_hash=…&type=signup
 * The token is only redeemed when the person presses the button, so email security
 * scanners that pre-open links cannot use up the one-time token.
 */
export function ConfirmEmailPage() {
  useDocumentTitle('Confirm email');
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const online = useOnline();
  const tokenHash = params.get('token_hash');
  const type = (params.get('type') ?? 'signup') as EmailOtpType;
  const [state, setState] = useState<State>(tokenHash ? 'ready' : 'invalid');
  const [email, setEmail] = useState('');
  const { cooldown, message, resend } = useResend('signup');

  async function confirm() {
    if (!tokenHash) return;
    setState('verifying');
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: type === 'email' ? 'email' : 'signup' });
    setState(error ? 'invalid' : 'success');
  }

  return (
    <AuthLayout>
      {(state === 'ready' || state === 'verifying') && (
        <>
          <div className="auth-hero-icon" aria-hidden><MailCheck size={36} /></div>
          <h1>Confirm your email</h1>
          <p className="muted">Press the button to finish verifying your DCU Active account.</p>
          <Button block size="lg" onClick={() => void confirm()} loading={state === 'verifying'} disabled={!online}>
            Confirm my email
          </Button>
        </>
      )}
      {state === 'success' && (
        <div role="status">
          <div className="auth-hero-icon success" aria-hidden><CheckCircle2 size={36} /></div>
          <h1>Email verified</h1>
          <p className="muted">Your account is ready. You can now book facilities.</p>
          <Button block size="lg" onClick={() => navigate('/', { replace: true })}>Continue to DCU Active</Button>
        </div>
      )}
      {state === 'invalid' && (
        <>
          <div className="auth-hero-icon danger" aria-hidden><XCircle size={36} /></div>
          <h1>This link is invalid or has expired</h1>
          <Alert tone="info">
            If you already verified your email, just <Link to="/login">log in</Link>.
          </Alert>
          <p className="muted">Otherwise, request a new verification email:</p>
          <Field label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Button block variant="secondary" onClick={() => void resend(email)} disabled={cooldown > 0 || !online}>
            {cooldown > 0 ? `Resend in ${cooldown}s` : 'Send a new verification email'}
          </Button>
          {message && <Alert tone={message.tone}>{message.text}</Alert>}
          <p className="auth-alt"><Link to={`/verify${email ? `?email=${encodeURIComponent(email)}` : ''}`}>I have a 6-digit code</Link></p>
        </>
      )}
    </AuthLayout>
  );
}
