import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, Clock } from 'lucide-react';
import { cancelBooking, checkIn } from '../../lib/api';
import type { AppError } from '../../lib/errors';
import type { Booking } from '../../lib/types';
import { formatDateLong, formatDuration, relativeDay, timeInJakarta } from '../../lib/time';
import { Button, Card, ConfirmDialog, StatusBadge } from '../../components/ui';
import { FacilityIcon } from '../../components/FacilityIcon';
import { useToast } from '../../components/toast';
import { useAuth } from '../../app/auth';
import { useOnline, useServerNow } from '../../app/hooks';

/** Refresh everything a booking change can affect. Nothing is simulated client-side. */
export function useInvalidateBookings() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['myBookings'] });
    void qc.invalidateQueries({ queryKey: ['booking'] });
    void qc.invalidateQueries({ queryKey: ['availability'] });
    void qc.invalidateQueries({ queryKey: ['overview'] });
  };
}

export function useBookingActions(booking: Booking) {
  const toast = useToast();
  const invalidate = useInvalidateBookings();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const cancel = useMutation({
    mutationFn: () => cancelBooking(booking.id),
    onSuccess: () => {
      setConfirmCancel(false);
      toast('Booking cancelled. The time is now available to others.');
      invalidate();
    },
  });
  const checkin = useMutation({
    mutationFn: () => checkIn(booking.id),
    onSuccess: () => {
      toast("You're checked in. Enjoy your game!");
      invalidate();
    },
    onError: () => invalidate(),
  });
  return { cancel, checkin, confirmCancel, setConfirmCancel };
}

/** Check-in state for display. The check_in RPC is the authority. */
export function useCheckInState(b: Booking) {
  const now = useServerNow(15_000);
  const opens = new Date(b.checkin_opens_at).getTime();
  const closes = new Date(b.checkin_closes_at).getTime();
  if (b.effective_status !== 'CONFIRMED') return { show: false as const };
  if (now < opens) return { show: true as const, enabled: false, hint: `Check-in opens at ${timeInJakarta(b.checkin_opens_at)}` };
  if (now <= closes) return { show: true as const, enabled: true, hint: `Check in before ${timeInJakarta(b.checkin_closes_at)}` };
  return { show: false as const };
}

export function BookingActions({ booking, showView = true }: { booking: Booking; showView?: boolean }) {
  const online = useOnline();
  const { cancel, checkin, confirmCancel, setConfirmCancel } = useBookingActions(booking);
  const ci = useCheckInState(booking);
  const { config } = useAuth();
  const canCancel = booking.status === 'CONFIRMED' && booking.can_cancel && booking.effective_status === 'CONFIRMED';
  return (
    <>
      {ci.show && <p className="hint" aria-live="polite">{ci.hint}</p>}
      {checkin.error && <p className="field-error" role="alert">{(checkin.error as AppError).message}</p>}
      <div className="actions">
        {showView && (
          <Link className="btn btn-secondary btn-md" to={`/bookings/${booking.id}`} aria-label={`View ${booking.facility.name} booking ${relativeDay(booking.date, config?.today ?? booking.date)} ${booking.start_time}`}>
            View
          </Link>
        )}
        {ci.show && (
          <Button onClick={() => checkin.mutate()} disabled={!ci.enabled || !online} loading={checkin.isPending}>
            Check in
          </Button>
        )}
        {canCancel && (
          <Button variant="ghost" className="danger-text" onClick={() => { cancel.reset(); setConfirmCancel(true); }} disabled={!online}>
            Cancel
          </Button>
        )}
      </div>
      <ConfirmDialog
        open={confirmCancel}
        title="Cancel this booking?"
        confirmLabel="Yes, cancel booking"
        danger
        loading={cancel.isPending}
        error={cancel.error ? (cancel.error as AppError).message : null}
        onConfirm={() => cancel.mutate()}
        onClose={() => setConfirmCancel(false)}
      >
        <p>
          <strong>{booking.activity.name}</strong> · {formatDateLong(booking.date)} · {booking.start_time}–{booking.end_time}
        </p>
        <p className="muted">The time will become available to other users.</p>
      </ConfirmDialog>
    </>
  );
}

export function BookingSummary({ booking, today }: { booking: Booking; today: string }) {
  const title = booking.facility.code === 'BASKETBALL_FUTSAL' ? `${booking.activity.name} · ${booking.facility.name}` : booking.facility.name;
  return (
    <div className="booking-summary">
      <div className="facility-icon-badge" aria-hidden><FacilityIcon code={booking.facility.code} /></div>
      <div>
        <h3>{title}</h3>
        <p className="meta"><CalendarDays size={16} aria-hidden /> {relativeDay(booking.date, today)}</p>
        <p className="meta"><Clock size={16} aria-hidden /> {booking.start_time}–{booking.end_time} · {formatDuration(booking.duration_minutes)}</p>
      </div>
      <StatusBadge status={booking.effective_status} />
    </div>
  );
}

export function BookingCard({ booking, today }: { booking: Booking; today: string }) {
  return (
    <Card as="li" className="booking-card" data-testid="booking-card">
      <BookingSummary booking={booking} today={today} />
      {booking.effective_status === 'NO_SHOW' && <p className="hint">Check-in time passed without check-in.</p>}
      {booking.effective_status === 'ADMIN_CANCELLED' && booking.cancellation_reason && (
        <p className="hint">Reason: {booking.cancellation_reason}</p>
      )}
      <BookingActions booking={booking} />
    </Card>
  );
}
