import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CalendarCheck, CalendarDays, CircleCheck, CircleX, UserCheck, UserX } from 'lucide-react';
import { adminDashboard, adminListBookings, adminStats } from '../../lib/api';
import type { AppError } from '../../lib/errors';
import { formatDateLong } from '../../lib/time';
import { useAuth } from '../../app/auth';
import { useDocumentTitle } from '../../app/hooks';
import { Card, ErrorState, Spinner, StatusBadge } from '../../components/ui';

export function AdminDashboardPage() {
  useDocumentTitle('Admin dashboard');
  const { config } = useAuth();
  const [date, setDate] = useState(config!.today);
  const dash = useQuery({ queryKey: ['admin', 'dashboard', date], queryFn: () => adminDashboard(date) });
  const stats = useQuery({ queryKey: ['admin', 'stats', date], queryFn: () => adminStats(date, date) });
  const list = useQuery({ queryKey: ['admin', 'bookings', 'day', date], queryFn: () => adminListBookings({ from: date, to: date, limit: 100 }) });

  const d = dash.data;
  const t = stats.data?.totals;
  const cards = d && t ? [
    { label: 'Bookings on this day', value: d.bookings_on_date, icon: CalendarDays },
    { label: 'Upcoming bookings (all days)', value: d.upcoming_bookings, icon: CalendarCheck },
    { label: 'Checked in', value: d.checked_in_on_date, icon: CircleCheck },
    { label: 'Cancellations', value: t.cancelled_by_user + t.cancelled_by_admin, icon: CircleX },
    { label: 'No-shows (last 7 days)', value: d.no_shows_last_7_days, icon: UserX },
    { label: 'Active users', value: d.active_users, icon: UserCheck },
  ] : [];
  const dayBookings = (list.data?.items ?? []).filter((b) => !['CANCELLED', 'ADMIN_CANCELLED'].includes(b.effective_status))
    .sort((a, b) => a.start_at.localeCompare(b.start_at));

  return (
    <div className="admin-page">
      <header className="admin-head">
        <div>
          <h1>Dashboard</h1>
          <p className="muted">{formatDateLong(date)}</p>
        </div>
        <label className="inline-field">
          <span>Date</span>
          <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
        </label>
      </header>

      {dash.error ? <ErrorState message={(dash.error as AppError).message} onRetry={() => void dash.refetch()} /> : !d || !t ? <Spinner /> : (
        <>
          <ul className="stat-grid" aria-label="Summary">
            {cards.map(({ label, value, icon: Icon }) => (
              <li key={label} className="stat-card">
                <Icon size={22} aria-hidden />
                <span className="stat-value">{value}</span>
                <span className="stat-label">{label}</span>
              </li>
            ))}
          </ul>

          <div className="admin-two-col">
            <Card>
              <h2>Facility utilization</h2>
              <p className="muted small">Booked time ÷ opening hours × resources, for this day.</p>
              <ul className="util-list">
                {d.utilization.map((u) => (
                  <li key={u.facility_id}>
                    <div className="util-row">
                      <span>{u.name}</span>
                      <span className="mono">{u.utilization_pct}%</span>
                    </div>
                    <div className="bar" role="img" aria-label={`${u.name} ${u.utilization_pct}% utilized`}>
                      <span style={{ width: `${Math.min(100, u.utilization_pct)}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            </Card>

            <Card>
              <div className="card-head">
                <h2>Bookings on this day</h2>
                <Link to={`/admin/bookings?from=${date}&to=${date}`}>Manage</Link>
              </div>
              {list.isPending ? <Spinner /> : dayBookings.length === 0 ? <p className="muted">No bookings.</p> : (
                <ul className="mini-list">
                  {dayBookings.slice(0, 12).map((b) => (
                    <li key={b.id}>
                      <span className="mono">{b.start_time}–{b.end_time}</span>
                      <span>{b.facility.code === 'BASKETBALL_FUTSAL' ? b.activity.name : b.facility.name}</span>
                      <span className="truncate">{b.user?.full_name}</span>
                      <StatusBadge status={b.effective_status} />
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
