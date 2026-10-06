import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { adminCancelBooking, adminFacilities, adminListBookings } from '../../lib/api';
import type { AppError } from '../../lib/errors';
import type { Booking, BookingStatus } from '../../lib/types';
import { BOOKING_STATUS_LABEL } from '../../lib/labels';
import { addDays, dateTimeInJakarta, formatDateLong, formatDuration, relativeDay } from '../../lib/time';
import { useAuth } from '../../app/auth';
import { useDocumentTitle } from '../../app/hooks';
import { Alert, Button, ErrorState, Modal, Spinner, StatusBadge } from '../../components/ui';
import { useToast } from '../../components/toast';

const PAGE = 50;

export function AdminBookingsPage() {
  useDocumentTitle('Bookings');
  const { config } = useAuth();
  const [params, setParams] = useSearchParams();
  const today = config!.today;
  const from = params.get('from') ?? today;
  const to = params.get('to') ?? addDays(today, config!.booking_horizon_days);
  const facilityId = params.get('facility') ?? '';
  const status = params.get('status') ?? '';
  const search = params.get('q') ?? '';
  const page = Number(params.get('page') ?? 0);
  const [searchInput, setSearchInput] = useState(search);
  const [selected, setSelected] = useState<Booking | null>(null);

  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v); else next.delete(k);
    if (k !== 'page') next.delete('page');
    setParams(next, { replace: true });
  };

  // Debounced search box.
  useEffect(() => {
    const t = window.setTimeout(() => { if (searchInput !== search) set('q', searchInput.trim()); }, 350);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const facilities = useQuery({ queryKey: ['admin', 'facilities'], queryFn: adminFacilities, staleTime: 10 * 60_000 });
  const q = useQuery({
    queryKey: ['admin', 'bookings', from, to, facilityId, status, search, page],
    queryFn: () => adminListBookings({ from, to, facilityId, status, search, limit: PAGE, offset: page * PAGE }),
  });

  return (
    <div className="admin-page">
      <header className="admin-head"><h1>Bookings</h1></header>

      <form className="filters" role="search" onSubmit={(e) => e.preventDefault()}>
        <label className="inline-field"><span>From</span>
          <input type="date" value={from} onChange={(e) => set('from', e.target.value)} /></label>
        <label className="inline-field"><span>To</span>
          <input type="date" value={to} onChange={(e) => set('to', e.target.value)} /></label>
        <label className="inline-field"><span>Facility</span>
          <select value={facilityId} onChange={(e) => set('facility', e.target.value)}>
            <option value="">All facilities</option>
            {facilities.data?.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select></label>
        <label className="inline-field"><span>Status</span>
          <select value={status} onChange={(e) => set('status', e.target.value)}>
            <option value="">All statuses</option>
            {(Object.keys(BOOKING_STATUS_LABEL) as BookingStatus[]).map((s) => <option key={s} value={s}>{BOOKING_STATUS_LABEL[s]}</option>)}
          </select></label>
        <label className="inline-field grow"><span>Search</span>
          <span className="input-icon">
            <Search size={18} aria-hidden />
            <input type="search" placeholder="Name, email or booking code" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
          </span></label>
      </form>

      {q.error ? <ErrorState message={(q.error as AppError).message} onRetry={() => void q.refetch()} /> : q.isPending ? <Spinner /> : (
        <>
          <p className="muted small" aria-live="polite">{q.data.total} booking{q.data.total === 1 ? '' : 's'}</p>
          {q.data.items.length === 0 ? <p className="muted">No bookings match these filters.</p> : (
            <>
              <table className="data-table">
                <thead>
                  <tr><th scope="col">Date</th><th scope="col">Time</th><th scope="col">Facility</th><th scope="col">User</th><th scope="col">Status</th><th scope="col">Code</th><th scope="col"><span className="sr-only">Actions</span></th></tr>
                </thead>
                <tbody>
                  {q.data.items.map((b) => (
                    <tr key={b.id}>
                      <td>{relativeDay(b.date, today)}</td>
                      <td className="mono">{b.start_time}–{b.end_time}</td>
                      <td>{b.facility.code === 'BASKETBALL_FUTSAL' ? `${b.activity.name}` : b.facility.name}<div className="muted small">{b.resource?.name}</div></td>
                      <td>{b.user?.full_name}<div className="muted small">{b.user?.email}</div></td>
                      <td><StatusBadge status={b.effective_status} /></td>
                      <td className="mono small">{b.booking_code}</td>
                      <td><Button size="sm" variant="secondary" onClick={() => setSelected(b)} aria-label={`View booking ${b.booking_code}`}>View</Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <ul className="data-cards">
                {q.data.items.map((b) => (
                  <li key={b.id} className="card">
                    <div className="row-between"><strong>{b.facility.code === 'BASKETBALL_FUTSAL' ? b.activity.name : b.facility.name}</strong><StatusBadge status={b.effective_status} /></div>
                    <p>{relativeDay(b.date, today)} · <span className="mono">{b.start_time}–{b.end_time}</span></p>
                    <p className="muted small">{b.user?.full_name} · {b.user?.email}</p>
                    <Button size="sm" variant="secondary" onClick={() => setSelected(b)} aria-label={`View booking ${b.booking_code}`}>View</Button>
                  </li>
                ))}
              </ul>
              <div className="pager">
                <Button size="sm" variant="secondary" disabled={page === 0} onClick={() => set('page', String(page - 1))}>Previous</Button>
                <span className="muted small">Page {page + 1} of {Math.max(1, Math.ceil(q.data.total / PAGE))}</span>
                <Button size="sm" variant="secondary" disabled={(page + 1) * PAGE >= q.data.total} onClick={() => set('page', String(page + 1))}>Next</Button>
              </div>
            </>
          )}
        </>
      )}
      <AdminBookingModal booking={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function AdminBookingModal({ booking, onClose }: { booking: Booking | null; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [confirming, setConfirming] = useState(false);
  const cancel = useMutation({
    mutationFn: () => adminCancelBooking(booking!.id, reason.trim()),
    onSuccess: () => {
      toast('Booking cancelled. The user will see it as "Cancelled by admin".');
      void qc.invalidateQueries({ queryKey: ['admin'] });
      void qc.invalidateQueries({ queryKey: ['availability'] });
      close();
    },
  });
  function close() {
    setReason('');
    setConfirming(false);
    cancel.reset();
    onClose();
  }
  const b = booking;
  const live = b && (b.effective_status === 'CONFIRMED' || b.effective_status === 'CHECKED_IN');
  return (
    <Modal open={!!b} onClose={close} title={b ? `Booking ${b.booking_code}` : 'Booking'} wide footer={
      live ? (confirming ? (
        <>
          <Button variant="secondary" onClick={() => setConfirming(false)} disabled={cancel.isPending}>Back</Button>
          <Button variant="danger" onClick={() => cancel.mutate()} loading={cancel.isPending}>Cancel this booking</Button>
        </>
      ) : <Button variant="danger" onClick={() => setConfirming(true)}>Cancel booking…</Button>) : undefined
    }>
      {b && (
        <>
          <dl className="summary-list">
            <div><dt>User</dt><dd>{b.user?.full_name}<div className="muted small">{b.user?.email}</div></dd></div>
            <div><dt>Facility</dt><dd>{b.facility.name}{b.facility.code === 'BASKETBALL_FUTSAL' ? ` · ${b.activity.name}` : ''}</dd></div>
            <div><dt>Resource</dt><dd>{b.resource?.name}</dd></div>
            <div><dt>Date</dt><dd>{formatDateLong(b.date)}</dd></div>
            <div><dt>Time</dt><dd>{b.start_time}–{b.end_time} ({formatDuration(b.duration_minutes)})</dd></div>
            <div><dt>Status</dt><dd><StatusBadge status={b.effective_status} /></dd></div>
            <div><dt>Booked at</dt><dd>{dateTimeInJakarta(b.created_at)}</dd></div>
            {b.checked_in_at && <div><dt>Checked in</dt><dd>{dateTimeInJakarta(b.checked_in_at)}</dd></div>}
            {b.cancelled_at && <div><dt>Cancelled</dt><dd>{dateTimeInJakarta(b.cancelled_at)}{b.cancellation_reason ? ` · ${b.cancellation_reason}` : ''}</dd></div>}
          </dl>
          {confirming && (
            <div className="field">
              <label htmlFor="cancel-reason">Reason (shown to the user)</label>
              <textarea id="cancel-reason" maxLength={500} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
          )}
          {cancel.error && <Alert tone="danger">{(cancel.error as AppError).message}</Alert>}
        </>
      )}
    </Modal>
  );
}
