import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, WifiOff } from 'lucide-react';
import { createBooking, getAvailability, getFacilitiesOverview } from '../../lib/api';
import type { AppError } from '../../lib/errors';
import type { Booking, Slot } from '../../lib/types';
import { addMinutesToTime, dateRange, formatDateLong, formatDateShort, formatDuration, hhmm } from '../../lib/time';
import { slotLabel } from '../../lib/labels';
import { useAuth } from '../../app/auth';
import { useDocumentTitle, useOnline } from '../../app/hooks';
import { Alert, Button, Card, EmptyState, ErrorState, Modal, Spinner, StatusBadge } from '../../components/ui';
import { FacilityIcon } from '../../components/FacilityIcon';

const CONFLICT_CODES = new Set(['SLOT_UNAVAILABLE', 'SLOT_FULL', 'FACILITY_BLOCKED', 'PAST_SLOT']);

export function BookFacilityPage() {
  const { code = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { config } = useAuth();
  const online = useOnline();
  const qc = useQueryClient();
  const today = config!.today;
  const dates = useMemo(() => dateRange(today, config!.last_bookable_date), [today, config]);

  const overview = useQuery({ queryKey: ['overview', today], queryFn: () => getFacilitiesOverview(today), enabled: online });
  const facility = overview.data?.find((f) => f.code === code.toUpperCase());
  useDocumentTitle(facility ? `Book ${facility.name}` : 'Book');

  const needsActivity = (facility?.activities.length ?? 0) > 1;
  const date = params.get('date') && dates.includes(params.get('date')!) ? params.get('date')! : today;
  const activityId = needsActivity ? params.get('activity') : facility?.activities[0]?.id ?? null;
  const [slot, setSlot] = useState<string | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [result, setResult] = useState<Booking | null>(null);
  const resultRef = useRef<HTMLHeadingElement>(null);

  const setParam = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    next.set(k, v);
    setParams(next, { replace: true });
  };

  const availability = useQuery({
    queryKey: ['availability', facility?.facility_id, date],
    queryFn: () => getAvailability(facility!.facility_id, date),
    enabled: !!facility && online && (!needsActivity || !!activityId),
    staleTime: 0,
    refetchInterval: 60_000,          // fallback if Realtime is unavailable
  });
  const slots = availability.data ?? [];
  const multiDuration = (facility?.allowed_durations.length ?? 0) > 1;

  // Live data can take a chosen time away (another user, an admin block). While the user is
  // still choosing, treat it as unselected and say so. During review we keep it: the server decides.
  const liveSlot = slots.find((s) => s.slot_start === slot) ?? null;
  const slotGone = !!slot && !!availability.data && !reviewOpen && (!liveSlot || liveSlot.status !== 'AVAILABLE');
  const activeSlot = slotGone ? null : slot;
  const selected = activeSlot ? liveSlot : null;
  const durations = facility
    ? facility.allowed_durations.filter((d) => !selected || d <= selected.max_duration_minutes)
    : [];
  // Standard facilities only have 30 minutes, so it is implied; longer ones must still fit.
  const activeDuration = !facility ? null
    : !multiDuration ? facility.allowed_durations[0]!
    : duration && (reviewOpen || durations.includes(duration)) ? duration : null;
  const shownNotice = notice ?? (slotGone ? `${hhmm(slot!)} is no longer available. Please choose another time.` : null);

  const book = useMutation({
    mutationFn: () => createBooking({
      facilityId: facility!.facility_id, activityId: activityId!, date, startTime: hhmm(slot!), duration: activeDuration!,
    }),
    onSuccess: (b) => {
      setReviewOpen(false);
      setResult(b);
      void qc.invalidateQueries({ queryKey: ['myBookings'] });
      void qc.invalidateQueries({ queryKey: ['availability'] });
      void qc.invalidateQueries({ queryKey: ['overview'] });
    },
    onError: (e: AppError) => {
      if (CONFLICT_CODES.has(e.code)) {
        setReviewOpen(false);
        setSlot(null);
        setNotice(e.message);
        void availability.refetch();
      }
    },
  });

  useEffect(() => {
    if (result) resultRef.current?.focus();
  }, [result]);

  if (!online && !facility) {
    return <div className="page"><BackLink /><OfflineAvailability /></div>;
  }
  if (overview.isPending) return <div className="page"><Spinner /></div>;
  if (overview.error) return <div className="page"><ErrorState message={(overview.error as AppError).message} onRetry={() => void overview.refetch()} /></div>;
  if (!facility) {
    return (
      <div className="page">
        <BackLink />
        <EmptyState title="Facility not found"><Link to="/book">See all facilities</Link></EmptyState>
      </div>
    );
  }

  const activity = facility.activities.find((a) => a.id === activityId);
  const facilityTitle = facility.code === 'BASKETBALL_FUTSAL' && activity ? `${activity.name} · ${facility.name}` : facility.name;

  // ---------- Result ----------
  if (result) {
    return (
      <div className="page">
        <Card className="result-card" aria-live="polite">
          <div className="result-icon" aria-hidden><CheckCircle2 size={44} /></div>
          <h1 tabIndex={-1} ref={resultRef}>Booking confirmed</h1>
          <dl className="summary-list">
            <div><dt>Facility</dt><dd>{result.facility.code === 'BASKETBALL_FUTSAL' ? `${result.activity.name} · ${result.facility.name}` : result.facility.name}</dd></div>
            <div><dt>Date</dt><dd>{formatDateLong(result.date)}</dd></div>
            <div><dt>Time</dt><dd>{result.start_time}–{result.end_time}</dd></div>
            <div><dt>Duration</dt><dd>{formatDuration(result.duration_minutes)}</dd></div>
            <div><dt>Status</dt><dd><StatusBadge status={result.effective_status} /></dd></div>
            <div><dt>Booking code</dt><dd className="mono">{result.booking_code}</dd></div>
          </dl>
          <p className="muted">Please check in at the facility between 15 minutes before and 15 minutes after the start time.</p>
          <div className="actions stack">
            <Button size="lg" block onClick={() => navigate(`/bookings/${result.id}`)}>View my booking</Button>
            <Button size="lg" block variant="secondary" onClick={() => navigate('/')}>Back to home</Button>
          </div>
        </Card>
      </div>
    );
  }

  const ready = !!activityId && !!activeSlot && !!activeDuration && !!selected;

  return (
    <div className="page booking-page">
      <BackLink />
      <header className="booking-head">
        <span className="facility-icon-badge" aria-hidden><FacilityIcon code={facility.code} size={30} /></span>
        <div>
          <h1>{facility.name}</h1>
          <p className="muted">Choose {needsActivity ? 'what to play, ' : ''}a date and a time</p>
        </div>
      </header>

      {shownNotice && <Alert tone="warning" onClose={() => { setNotice(null); setSlot(null); }}>{shownNotice}</Alert>}

      {needsActivity && (
        <fieldset className="step">
          <legend>What would you like to play?</legend>
          <div className="choice-row">
            {facility.activities.map((a) => (
              <button key={a.id} type="button" className="choice" aria-pressed={activityId === a.id}
                onClick={() => setParam('activity', a.id)}>
                {a.name}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      {(!needsActivity || activityId) && (
        <>
          <fieldset className="step">
            <legend>Date</legend>
            <div className="date-strip" role="group" aria-label="Choose a date">
              {dates.map((d) => {
                const s = formatDateShort(d);
                return (
                  <button key={d} type="button" className="date-chip" aria-pressed={d === date}
                    aria-label={formatDateLong(d)}
                    onClick={() => { setParam('date', d); setSlot(null); setNotice(null); }}>
                    <span className="dc-wd">{d === today ? 'Today' : s.weekday}</span>
                    <span className="dc-day">{s.day}</span>
                    <span className="dc-mo">{s.month}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <fieldset className="step">
            <legend>Start time <span className="muted small">· {formatDateLong(date)}</span></legend>
            {!online ? <OfflineAvailability /> : availability.isPending ? <Spinner label="Loading live availability…" /> : availability.error ? (
              <ErrorState message={(availability.error as AppError).message} onRetry={() => void availability.refetch()} />
            ) : (
              <SlotGrid slots={slots} selected={activeSlot} onSelect={(s) => {
                setSlot(s.slot_start);
                setNotice(null);
                setDuration(null);
              }} />
            )}
          </fieldset>

          {selected && multiDuration && (
            <fieldset className="step">
              <legend>Duration</legend>
              <div className="choice-row">
                {durations.map((d) => (
                  <button key={d} type="button" className="choice" aria-pressed={activeDuration === d} onClick={() => setDuration(d)}>
                    {formatDuration(d)}
                    <small>{hhmm(selected.slot_start)}–{addMinutesToTime(hhmm(selected.slot_start), d)}</small>
                  </button>
                ))}
              </div>
              {durations.length < facility.allowed_durations.length && (
                <p className="hint">Longer bookings aren't possible at this time because the following slots are taken.</p>
              )}
            </fieldset>
          )}
        </>
      )}

      <div className="sticky-cta">
        <div className="sticky-summary" aria-live="polite">
          {ready ? `${formatDateShort(date).weekday} ${formatDateShort(date).day} ${formatDateShort(date).month} · ${hhmm(slot!)}–${addMinutesToTime(hhmm(slot!), activeDuration!)}` : selected && multiDuration ? 'Choose a duration' : 'Select a time'}
        </div>
        <Button size="lg" disabled={!ready || !online} onClick={() => { book.reset(); setReviewOpen(true); }}>
          Review booking
        </Button>
      </div>

      <Modal open={reviewOpen} onClose={() => setReviewOpen(false)} title="Review your booking" footer={
        <>
          <Button variant="secondary" onClick={() => setReviewOpen(false)} disabled={book.isPending}>Change</Button>
          <Button onClick={() => book.mutate()} loading={book.isPending} disabled={!online}>Confirm booking</Button>
        </>
      }>
        {slot && activeDuration && (
          <dl className="summary-list">
            <div><dt>Facility</dt><dd>{facilityTitle}</dd></div>
            <div><dt>Date</dt><dd>{formatDateLong(date)}</dd></div>
            <div><dt>Time</dt><dd>{hhmm(slot)}–{addMinutesToTime(hhmm(slot), activeDuration)}</dd></div>
            <div><dt>Duration</dt><dd>{formatDuration(activeDuration)}</dd></div>
          </dl>
        )}
        {book.error && !CONFLICT_CODES.has((book.error as AppError).code) && (
          <Alert tone="danger">
            {(book.error as AppError).message}{' '}
            {['MAX_ACTIVE_BOOKINGS', 'ALREADY_BOOKED_TODAY', 'USER_OVERLAP'].includes((book.error as AppError).code) && (
              <Link to="/bookings">See my bookings</Link>
            )}
          </Alert>
        )}
      </Modal>
    </div>
  );
}

function BackLink() {
  return <Link to="/book" className="back-link"><ArrowLeft size={18} aria-hidden /> All facilities</Link>;
}

function OfflineAvailability() {
  return (
    <div className="offline-box" role="status">
      <WifiOff size={22} aria-hidden />
      <p>Live availability is hidden while you're offline. Connect to the internet to see current times.</p>
    </div>
  );
}

function SlotGrid({ slots, selected, onSelect }: { slots: Slot[]; selected: string | null; onSelect: (s: Slot) => void }) {
  const visible = slots.filter((s) => s.status !== 'PAST');
  if (visible.length === 0) {
    return <EmptyState title="No more times today">Please choose another date.</EmptyState>;
  }
  const anyAvailable = visible.some((s) => s.status === 'AVAILABLE');
  return (
    <>
      {!anyAvailable && <Alert tone="info">No times are available on this date. Please choose another date.</Alert>}
      <ul className="slot-grid" aria-label="Start times">
        {visible.map((s) => {
          const label = slotLabel(s);
          const available = s.status === 'AVAILABLE';
          return (
            <li key={s.slot_start}>
              <button
                type="button"
                className={`slot slot-${s.status.toLowerCase()}`}
                aria-pressed={selected === s.slot_start}
                aria-label={`${hhmm(s.slot_start)}, ${label}`}
                disabled={!available}
                onClick={() => onSelect(s)}
                data-testid={`slot-${hhmm(s.slot_start)}`}
              >
                <span className="slot-time">{hhmm(s.slot_start)}</span>
                <span className="slot-label">{label}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="legend muted small">Times are shown in Jakarta time (WIB).</p>
    </>
  );
}
