import { describe, expect, it } from 'vitest';
import { AppError, MESSAGES, toAppError } from './errors';
import { addDays, addMinutesToTime, dateRange, formatDateLong, greeting, halfHourOptions, relativeDay, timeInJakarta } from './time';
import { isStrongPassword, isValidEmail, passwordProblems, safeNext } from './password';
import { slotLabel } from './labels';
import type { Slot } from './types';

describe('toAppError', () => {
  it('maps RPC business codes to friendly text and parses details', () => {
    const e = toAppError({ code: 'P0001', message: 'BLOCK_CONFLICTS', details: '{"conflicts":[{"id":"x"}]}' });
    expect(e.code).toBe('BLOCK_CONFLICTS');
    expect(e.details).toEqual({ conflicts: [{ id: 'x' }] });
  });
  it('uses the agreed concurrency message', () => {
    expect(toAppError({ code: 'P0001', message: 'SLOT_UNAVAILABLE' }).message)
      .toBe('Sorry, this time slot was just booked by another user. Please choose another available time.');
  });
  it('never leaks raw database text', () => {
    const e = toAppError({ code: '23P01', message: 'conflicting key value violates exclusion constraint "bookings_no_resource_overlap"' });
    expect(e.message).toBe(MESSAGES.UNKNOWN);
    expect(e.message).not.toMatch(/constraint|bookings_/);
  });
  it('maps unknown P0001 messages to the generic text', () => {
    expect(toAppError({ code: 'P0001', message: 'SOMETHING_NEW' }).message).toBe(MESSAGES.UNKNOWN);
  });
  it('maps Supabase Auth codes', () => {
    expect(toAppError({ name: 'AuthApiError', code: 'invalid_credentials', message: 'Invalid login credentials' }).message)
      .toBe('Incorrect email or password.');
    expect(toAppError({ name: 'AuthApiError', code: 'email_not_confirmed' }).code).toBe('email_not_confirmed');
  });
  it('maps fetch failures to the network message', () => {
    expect(toAppError(new TypeError('Failed to fetch')).code).toBe('NETWORK');
  });
  it('passes AppError through', () => {
    const e = new AppError('MAX_ACTIVE_BOOKINGS');
    expect(toAppError(e)).toBe(e);
    expect(e.message).toBe('You already have the maximum number of upcoming bookings.');
  });
});

describe('Jakarta time helpers', () => {
  it('builds the 8-day booking window today..today+7', () => {
    const d = dateRange('2026-10-06', addDays('2026-10-06', 7));
    expect(d).toHaveLength(8);
    expect(d[0]).toBe('2026-10-06');
    expect(d[7]).toBe('2026-10-13');
  });
  it('crosses month and year boundaries', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
  });
  it('formats dates in the agreed long form', () => {
    expect(formatDateLong('2026-10-06')).toBe('Tuesday, 6 October 2026');
  });
  it('shows Jakarta time regardless of the device timezone', () => {
    // 11:00 UTC is 18:00 WIB.
    expect(timeInJakarta('2026-10-06T11:00:00Z')).toBe('18:00');
    // 23:00 UTC on the 5th is 06:00 WIB on the 6th.
    expect(timeInJakarta('2026-10-05T23:00:00Z')).toBe('06:00');
  });
  it('relative day labels', () => {
    expect(relativeDay('2026-10-06', '2026-10-06')).toBe('Today');
    expect(relativeDay('2026-10-07', '2026-10-06')).toBe('Tomorrow');
    expect(relativeDay('2026-10-09', '2026-10-06')).toBe('Fri 9 Oct');
  });
  it('time arithmetic', () => {
    expect(addMinutesToTime('19:30', 90)).toBe('21:00');
    expect(halfHourOptions('06:00', '07:00')).toEqual(['06:00', '06:30', '07:00']);
    expect(halfHourOptions()).toHaveLength(48);
  });
  it('greets by Jakarta hour', () => {
    expect(greeting(Date.parse('2026-10-06T00:30:00Z'))).toBe('Good morning'); // 07:30 WIB
    expect(greeting(Date.parse('2026-10-06T13:00:00Z'))).toBe('Good night');   // 20:00 WIB
  });
});

describe('password policy (guidance mirror of Supabase Auth)', () => {
  it('requires 8+ chars with lower, upper, digit and symbol', () => {
    expect(isStrongPassword('Abcdef1!')).toBe(true);
    expect(passwordProblems('abcdef1!').map((r) => r.id)).toEqual(['upper']);
    expect(passwordProblems('ABCDEF1!').map((r) => r.id)).toEqual(['lower']);
    expect(passwordProblems('Abcdefg!').map((r) => r.id)).toEqual(['digit']);
    expect(passwordProblems('Abcdefg1').map((r) => r.id)).toEqual(['symbol']);
    expect(passwordProblems('Ab1!').map((r) => r.id)).toEqual(['length']);
    expect(passwordProblems('Abcdefg1 é').map((r) => r.id)).toEqual(['symbol']); // space/accents are not symbols for Supabase
  });
  it('validates emails loosely (server is the authority)', () => {
    expect(isValidEmail('a.b@gmail.com')).toBe(true);
    expect(isValidEmail('nope')).toBe(false);
  });
});

describe('safeNext (open-redirect guard)', () => {
  it.each([
    [null, '/'], ['/bookings', '/bookings'], ['https://evil.example', '/'], ['//evil.example', '/'], ['/\\evil', '/'],
  ])('%s -> %s', (input, out) => expect(safeNext(input as string | null)).toBe(out));
});

describe('slot labels never contain identities', () => {
  const base: Slot = { slot_start: '18:00:00', slot_end: '18:30:00', status: 'AVAILABLE', available_count: 1, total_count: 2, max_duration_minutes: 30, block_reason: null };
  it('multi-resource availability', () => {
    expect(slotLabel(base)).toBe('1 spot left');
    expect(slotLabel({ ...base, available_count: 2 })).toBe('2 spots left');
    expect(slotLabel({ ...base, status: 'FULL', available_count: 0 })).toBe('Full');
  });
  it('single-resource and blocked', () => {
    expect(slotLabel({ ...base, total_count: 1 })).toBe('Available');
    expect(slotLabel({ ...base, status: 'BOOKED', total_count: 1 })).toBe('Booked');
    expect(slotLabel({ ...base, status: 'BLOCKED', block_reason: 'MAINTENANCE' })).toBe('Unavailable · Maintenance');
    expect(slotLabel({ ...base, status: 'MINE' })).toBe('Your booking');
  });
});
