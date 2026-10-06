// Turns anything thrown by Supabase/PostgREST/fetch into a business-friendly message.
// Raw SQL text, constraint names and stack traces never reach the UI.

export const MESSAGES: Record<string, string> = {
  // Booking
  SLOT_UNAVAILABLE: 'Sorry, this time slot was just booked by another user. Please choose another available time.',
  SLOT_FULL: 'Sorry, all tables were just taken for this time. Please choose another available time.',
  FACILITY_BLOCKED: 'This facility is unavailable during the selected time.',
  MAX_ACTIVE_BOOKINGS: 'You already have the maximum number of upcoming bookings.',
  ALREADY_BOOKED_TODAY: 'You already have a booking for this facility on that day.',
  USER_OVERLAP: 'You already have another booking at that time.',
  OUTSIDE_HORIZON: 'This date is outside the booking period.',
  OUTSIDE_HOURS: 'Bookings are only possible between 06:00 and 21:00.',
  PAST_SLOT: 'This time has already started. Please choose a later time.',
  INVALID_DURATION: 'This duration is not available for this facility.',
  INVALID_START_TIME: 'Please choose one of the listed start times.',
  INVALID_ACTIVITY: 'Please choose what you would like to play.',
  FACILITY_NOT_FOUND: 'This facility is not available.',
  // Booking management
  BOOKING_NOT_FOUND: 'We could not find this booking.',
  BOOKING_NOT_CANCELLABLE: 'This booking can no longer be cancelled.',
  CANNOT_CANCEL_STARTED: 'This booking has already started and can no longer be cancelled.',
  ALREADY_CHECKED_IN: 'You are already checked in.',
  CHECKIN_NOT_ALLOWED: 'Check-in is not possible for this booking.',
  CHECKIN_TOO_EARLY: 'Check-in is not open yet.',
  CHECKIN_EXPIRED: 'The check-in time for this booking has passed.',
  // Account
  NOT_AUTHENTICATED: 'Your session has ended. Please log in again.',
  ACCOUNT_DISABLED: 'Your account has been disabled. Please contact the DCU administrator.',
  EMAIL_NOT_VERIFIED: 'Please verify your email address first.',
  PROFILE_NOT_FOUND: 'Your profile could not be found. Please contact the DCU administrator.',
  NOT_AUTHORIZED: 'You do not have permission to do this.',
  // Admin
  BLOCK_CONFLICTS: 'This block overlaps existing bookings.',
  BLOCK_NOT_FOUND: 'This block no longer exists.',
  BLOCK_ALREADY_ENDED: 'This block has already ended.',
  BLOCK_IN_PAST: 'The block must end in the future.',
  INVALID_BLOCK_TIME: 'Please choose a valid start and end time (30-minute steps, end after start).',
  INVALID_RESOURCE: 'Please choose a resource that belongs to this facility.',
  INVALID_REASON: 'Please choose a reason.',
  USER_NOT_FOUND: 'User not found.',
  LAST_ADMIN: 'At least one active administrator is required.',
  INVALID_ROLE: 'Invalid role.',
  INVALID_SETTINGS: 'One of the settings is out of range.',
  INVALID_INPUT: 'Some information is missing or invalid.',
  // Client-side
  NETWORK: "We couldn't connect to DCU Active. Please check your internet connection and try again.",
  OFFLINE: 'You are offline. Connect to the internet to view live availability or make a booking.',
  UNKNOWN: 'Something went wrong. Please try again.',
};

// Supabase Auth error codes → friendly text.
const AUTH_MESSAGES: Record<string, string> = {
  invalid_credentials: 'Incorrect email or password.',
  email_not_confirmed: 'Please verify your email address first. We sent you a link and a code.',
  user_already_exists: 'An account with this email already exists. Try logging in instead.',
  email_exists: 'An account with this email already exists. Try logging in instead.',
  weak_password: 'Password must be at least 8 characters with uppercase, lowercase, a number and a symbol.',
  otp_expired: 'This link or code is invalid or has expired.',
  over_email_send_rate_limit: 'Too many emails were requested. Please wait a minute and try again.',
  over_request_rate_limit: 'Too many attempts. Please wait a moment and try again.',
  same_password: 'Please choose a password different from your current one.',
  validation_failed: 'Please check the information you entered.',
};

export class AppError extends Error {
  readonly code: string;
  readonly details: unknown;
  constructor(code: string, message?: string, details?: unknown) {
    super(message ?? MESSAGES[code] ?? MESSAGES.UNKNOWN);
    this.code = code;
    this.details = details;
  }
}

function parseDetails(raw: unknown): unknown {
  if (typeof raw !== 'string' || raw === '') return raw ?? null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Normalizes PostgREST, Supabase Auth and network errors. */
export function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return new AppError('OFFLINE');

  const e = err as { code?: string; message?: string; details?: unknown; name?: string; status?: number } | null;
  if (!e) return new AppError('UNKNOWN');

  // Business errors from our RPCs: code P0001 + stable message.
  if (e.code === 'P0001' && e.message && MESSAGES[e.message]) {
    return new AppError(e.message, undefined, parseDetails(e.details));
  }
  // Supabase Auth errors carry a string code.
  if (e.name === 'AuthApiError' || e.name === 'AuthWeakPasswordError' || (e.code && AUTH_MESSAGES[e.code])) {
    const code = e.code ?? '';
    return new AppError(code || 'UNKNOWN', AUTH_MESSAGES[code] ?? MESSAGES.UNKNOWN);
  }
  if (e.name === 'AuthRetryableFetchError' || e.name === 'TypeError' || /fetch|network/i.test(e.message ?? '')) {
    return new AppError('NETWORK');
  }
  if (e.code === 'PGRST301' || e.status === 401) return new AppError('NOT_AUTHENTICATED');
  if (e.code === '42501') return new AppError('NOT_AUTHORIZED');
  return new AppError('UNKNOWN');
}
