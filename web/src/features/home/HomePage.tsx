import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CalendarPlus, ChevronRight } from 'lucide-react';
import { getFacilitiesOverview, getMyBookings } from '../../lib/api';
import type { AppError } from '../../lib/errors';
import { greeting } from '../../lib/time';
import { useAuth } from '../../app/auth';
import { useDocumentTitle, useOnline, useServerNow } from '../../app/hooks';
import { Alert, Card, EmptyState, ErrorState, Spinner } from '../../components/ui';
import { BookingActions, BookingSummary } from '../bookings/BookingCard';
import { FacilityGrid } from '../booking/FacilityListPage';

export function HomePage() {
  useDocumentTitle('Home');
  const { profile, config } = useAuth();
  const now = useServerNow(60_000);
  const online = useOnline();
  const [params] = useSearchParams();
  const today = config!.today;

  const upcoming = useQuery({ queryKey: ['myBookings', 'UPCOMING'], queryFn: () => getMyBookings('UPCOMING'), enabled: online });
  const overview = useQuery({ queryKey: ['overview', today], queryFn: () => getFacilitiesOverview(today), enabled: online, staleTime: 0 });
  const next = upcoming.data?.[0];
  const firstName = profile?.full_name.split(' ')[0] ?? '';

  return (
    <div className="page">
      {params.get('welcome') && <Alert tone="success" title="Your email is verified">Welcome to DCU Active!</Alert>}
      <header className="page-head">
        <p className="eyebrow">DCU Active</p>
        <h1>{greeting(now)}{firstName ? `, ${firstName}` : ''}</h1>
      </header>

      <Link to="/book" className="cta-book">
        <CalendarPlus size={28} aria-hidden />
        <span>
          <strong>Book a facility</strong>
          <small>Choose a sport, date and time</small>
        </span>
        <ChevronRight size={24} aria-hidden />
      </Link>

      <section aria-labelledby="next-booking">
        <h2 id="next-booking">My next booking</h2>
        {upcoming.isPending && online ? <Spinner /> : upcoming.error ? (
          <ErrorState message={(upcoming.error as AppError).message} onRetry={() => void upcoming.refetch()} />
        ) : next ? (
          <Card className="booking-card next-booking" data-testid="next-booking">
            <BookingSummary booking={next} today={today} />
            <BookingActions booking={next} />
          </Card>
        ) : online ? (
          <Card><EmptyState title="No upcoming bookings">
            <p className="muted">When you book a facility it will appear here.</p>
          </EmptyState></Card>
        ) : null}
      </section>

      <section aria-labelledby="facilities">
        <h2 id="facilities">Facilities today</h2>
        {!online ? null : overview.isPending ? <Spinner /> : overview.error ? (
          <ErrorState message={(overview.error as AppError).message} onRetry={() => void overview.refetch()} />
        ) : (
          <FacilityGrid facilities={overview.data ?? []} showAvailability />
        )}
      </section>
    </div>
  );
}
