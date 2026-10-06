// Mirrors the Supabase Auth policy (min 8, lower + upper + digit + symbol) for guidance only.
// Supabase Auth enforces it server-side; this never replaces that check.

export interface PasswordRule {
  id: string;
  label: string;
  test: (pw: string) => boolean;
}

export const PASSWORD_RULES: PasswordRule[] = [
  { id: 'length', label: 'At least 8 characters', test: (p) => p.length >= 8 },
  { id: 'lower', label: 'A lowercase letter (a–z)', test: (p) => /[a-z]/.test(p) },
  { id: 'upper', label: 'An uppercase letter (A–Z)', test: (p) => /[A-Z]/.test(p) },
  { id: 'digit', label: 'A number (0–9)', test: (p) => /[0-9]/.test(p) },
  // Same symbol set Supabase Auth accepts.
  { id: 'symbol', label: 'A symbol (e.g. ! ? # @ .)', test: (p) => /[!@#$%^&*()_+\-=[\]{};'\\:"|<>?,./`~]/.test(p) },
];

export const passwordProblems = (pw: string) => PASSWORD_RULES.filter((r) => !r.test(pw));
export const isStrongPassword = (pw: string) => passwordProblems(pw).length === 0;

export const isValidEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());

/** Only same-origin relative paths are accepted as post-login destinations (open-redirect guard). */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.includes('\\')) return '/';
  return next;
}
