import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { getBooking } from '../../lib/api';
import type { AppError } from '../../lib/errors';
import { formatDateLong, formatDuration, dateTimeInJakarta, timeInJakarta } from '../../lib/time';
import { useDocumentTitle, useOnline } from '../../app/hooks';
import { Card, ErrorState, Spinner, StatusBadge } from '../../components/ui';
import { FacilityIcon } from '../../components/FacilityIcon';
import { BookingActions } from './BookingCard';

export function BookingDetailPage() {
  useDocumentTitle('Booking');
  const { id = '' } = useParams();
  const online = useOnline();
  const q = useQuery({ queryKey: ['booking', id], queryFn: () => getBooking(id), enabled: online });
  const b = q.data;

  return (
    <div className="page">
      <Link to="/bookings" className="back-link"><ArrowLeft size={18} aria-hidden /> My bookings</Link>
      {!online ? null : q.isPending ? <Spinner /> : q.error ? (
        <ErrorState message={(q.error as AppError).message} />
      ) : b && (
        <Card className="detail-card">
          <header className="booking-head">
            <span className="facility-icon-badge" aria-hidden><FacilityIcon code={b.facility.code} size={30} /></span>
            <div>
              <h1>{b.facility.code === 'BASKETBALL_FUTSAL' ? `${b.activity.name} · ${b.facility.name}` : b.facility.name}</h1>
              <StatusBadge status={b.effective_status} />
            </div>
          </header>
          <dl className="summary-list">
            <div><dt>Date</dt><dd>{formatDateLong(b.date)}</dd></div>
            <div><dt>Time</dt><dd>{b.start_time}–{b.end_time}</dd></div>
            <div><dt>Duration</dt><dd>{formatDuration(b.duration_minutes)}</dd></div>
            <div><dt>Booking code</dt><dd className="mono">{b.booking_code}</dd></div>
            {b.effective_status === 'CONFIRMED' && (
              <div><dt>Check-in window</dt><dd>{timeInJakarta(b.checkin_opens_at)}–{timeInJakarta(b.checkin_closes_at)}</dd></div>
            )}
            {b.checked_in_at && <div><dt>Checked in</dt><dd>{dateTimeInJakarta(b.checked_in_at)}</dd></div>}
            {b.cancelled_at && <div><dt>Cancelled</dt><dd>{dateTimeInJakarta(b.cancelled_at)}</dd></div>}
            {b.cancellation_reason && <div><dt>Reason</dt><dd>{b.cancellation_reason}</dd></div>}
          </dl>
          {b.effective_status === 'NO_SHOW' && <p className="hint">This booking was not checked in within the check-in window.</p>}
          <BookingActions booking={b} showView={false} />
        </Card>
      )}
    </div>
  );
}
