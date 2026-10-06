import { NavLink, Outlet, Link } from 'react-router-dom';
import {
  CalendarDays, House, LayoutDashboard, ListChecks, Ban, Users, UserRound, CalendarPlus, ShieldCheck, ArrowLeft, RefreshCw,
} from 'lucide-react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useAuth } from '../app/auth';
import { useOnline } from '../app/hooks';
import { OfflineNotice, Button } from './ui';

export function Logo({ to = '/' }: { to?: string }) {
  return (
    <Link to={to} className="logo" aria-label="DCU Active home">
      <img src="/favicon.svg" alt="" width={28} height={28} />
      <span>DCU Active</span>
    </Link>
  );
}

function SkipLink() {
  return <a href="#main" className="skip-link">Skip to content</a>;
}

/** Participant / trainer layout: bottom tabs on phones, side rail on tablet/desktop. */
export function UserShell() {
  const { isAdmin } = useAuth();
  const online = useOnline();
  const items = [
    { to: '/', label: 'Home', icon: House, end: true },
    { to: '/book', label: 'Book', icon: CalendarPlus },
    { to: '/bookings', label: 'My Bookings', icon: CalendarDays },
    { to: '/profile', label: 'Profile', icon: UserRound },
    ...(isAdmin ? [{ to: '/admin', label: 'Admin', icon: ShieldCheck }] : []),
  ];
  return (
    <div className="user-shell">
      <SkipLink />
      <header className="topbar">
        <Logo />
      </header>
      <nav className="user-nav" aria-label="Main">
        <ul>
          {items.map(({ to, label, icon: Icon, end }) => (
            <li key={to}>
              <NavLink to={to} end={end}>
                <Icon size={22} aria-hidden />
                <span>{label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <main id="main" className="user-main" tabIndex={-1}>
        {!online && <OfflineNotice />}
        <Outlet />
      </main>
    </div>
  );
}

/** Admin layout: sidebar on desktop, tab strip on smaller screens. */
export function AdminShell() {
  const online = useOnline();
  const items = [
    { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/admin/bookings', label: 'Bookings', icon: ListChecks },
    { to: '/admin/blocks', label: 'Facility blocks', icon: Ban },
    { to: '/admin/users', label: 'Users', icon: Users },
  ];
  return (
    <div className="admin-shell">
      <SkipLink />
      <aside className="admin-side">
        <Logo to="/admin" />
        <span className="admin-tag">Admin</span>
        <nav aria-label="Admin">
          <ul>
            {items.map(({ to, label, icon: Icon, end }) => (
              <li key={to}>
                <NavLink to={to} end={end}>
                  <Icon size={20} aria-hidden />
                  <span>{label}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <Link to="/" className="admin-back"><ArrowLeft size={18} aria-hidden /> Back to booking app</Link>
      </aside>
      <main id="main" className="admin-main" tabIndex={-1}>
        {!online && <OfflineNotice />}
        <Outlet />
      </main>
    </div>
  );
}

export function AuthLayout({ children }: { children: React.ReactNode }) {
  const online = useOnline();
  return (
    <div className="auth-layout">
      <SkipLink />
      <header className="auth-header"><Logo to="/login" /></header>
      <main id="main" className="auth-main" tabIndex={-1}>
        {!online && <OfflineNotice />}
        <div className="auth-card">{children}</div>
      </main>
    </div>
  );
}

/** "New version available" banner. The service worker never swaps versions silently. */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (registration) window.setInterval(() => void registration.update(), 60 * 60_000);
    },
  });
  if (!needRefresh) return null;
  return (
    <div className="update-banner" role="status">
      <RefreshCw size={18} aria-hidden />
      <span>A new version of DCU Active is available.</span>
      <Button size="sm" onClick={() => void updateServiceWorker(true)}>Reload</Button>
    </div>
  );
}
