import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CalendarX } from 'lucide-react';
import { getMyBookings } from '../../lib/api';
import type { AppError } from '../../lib/errors';
import { useAuth } from '../../app/auth';
import { useDocumentTitle, useOnline } from '../../app/hooks';
import { EmptyState, ErrorState, Spinner } from '../../components/ui';
import { BookingCard } from './BookingCard';

export function MyBookingsPage() {
  useDocumentTitle('My bookings');
  const [params, setParams] = useSearchParams();
  const { config } = useAuth();
  const online = useOnline();
  const tab = params.get('tab') === 'history' ? 'HISTORY' : 'UPCOMING';
  const q = useQuery({ queryKey: ['myBookings', tab], queryFn: () => getMyBookings(tab), enabled: online });

  return (
    <div className="page">
      <header className="page-head"><h1>My bookings</h1></header>
      <div className="tabs" role="tablist" aria-label="Bookings">
        {(['UPCOMING', 'HISTORY'] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} id={`tab-${t}`} aria-controls="bookings-panel"
            onClick={() => setParams(t === 'HISTORY' ? { tab: 'history' } : {}, { replace: true })}>
            {t === 'UPCOMING' ? 'Upcoming' : 'History'}
          </button>
        ))}
      </div>
      <div id="bookings-panel" role="tabpanel" aria-labelledby={`tab-${tab}`}>
        {!online ? null : q.isPending ? <Spinner /> : q.error ? (
          <ErrorState message={(q.error as AppError).message} onRetry={() => void q.refetch()} />
        ) : q.data!.length === 0 ? (
          <EmptyState icon={<CalendarX size={36} />} title={tab === 'UPCOMING' ? 'No upcoming bookings' : 'No past bookings yet'}>
            {tab === 'UPCOMING' && <Link className="btn btn-primary btn-md" to="/book">Book a facility</Link>}
          </EmptyState>
        ) : (
          <ul className="booking-list">
            {q.data!.map((b) => <BookingCard key={b.id} booking={b} today={config!.today} />)}
          </ul>
        )}
      </div>
    </div>
  );
}
