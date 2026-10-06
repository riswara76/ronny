import { lazy, Suspense } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth';
import { RealtimeBridge } from './RealtimeBridge';
import { AdminShell, UserShell, UpdatePrompt } from '../components/shells';
import { Spinner, ErrorState, OfflineNotice } from '../components/ui';
import { useOnline } from './hooks';
import { LoginPage } from '../features/auth/LoginPage';
import { RegisterPage } from '../features/auth/RegisterPage';
import { VerifyCodePage } from '../features/auth/VerifyCodePage';
import { ConfirmEmailPage } from '../features/auth/ConfirmEmailPage';
import { ForgotPasswordPage } from '../features/auth/ForgotPasswordPage';
import { ResetPasswordPage } from '../features/auth/ResetPasswordPage';
import { AccountDisabledPage } from '../features/auth/AccountDisabledPage';
import { HomePage } from '../features/home/HomePage';
import { FacilityListPage } from '../features/booking/FacilityListPage';
import { BookFacilityPage } from '../features/booking/BookFacilityPage';
import { MyBookingsPage } from '../features/bookings/MyBookingsPage';
import { BookingDetailPage } from '../features/bookings/BookingDetailPage';
import { ProfilePage } from '../features/profile/ProfilePage';
import { NotFoundPage } from '../features/NotFoundPage';

// Admin screens are loaded on demand: participants never download them.
const AdminDashboardPage = lazy(() => import('../features/admin/AdminDashboardPage').then((m) => ({ default: m.AdminDashboardPage })));
const AdminBookingsPage = lazy(() => import('../features/admin/AdminBookingsPage').then((m) => ({ default: m.AdminBookingsPage })));
const AdminBlocksPage = lazy(() => import('../features/admin/AdminBlocksPage').then((m) => ({ default: m.AdminBlocksPage })));
const AdminUsersPage = lazy(() => import('../features/admin/AdminUsersPage').then((m) => ({ default: m.AdminUsersPage })));

/** UX guard only. Every RPC re-checks identity, verification and activity on the server. */
function RequireAuth() {
  const { session, sessionLoading, disabled, config, configError, refreshConfig } = useAuth();
  const location = useLocation();
  const online = useOnline();
  if (sessionLoading) return <div className="center-page"><Spinner /></div>;
  if (!session) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  if (disabled) return <Navigate to="/account-disabled" replace />;
  // Opened (or reloaded) without a connection: nothing live can be shown, so say so clearly.
  if (!config && !online) return <div className="center-page"><OfflineNotice /></div>;
  if (configError && configError.code !== 'ACCOUNT_DISABLED') {
    return <div className="center-page"><ErrorState message={configError.message} onRetry={refreshConfig} /></div>;
  }
  if (!config) return <div className="center-page"><Spinner /></div>;
  return (
    <>
      <RealtimeBridge />
      <Outlet />
    </>
  );
}

/** Cosmetic: hides admin screens from non-admins. The admin RPCs enforce the real check. */
function RequireAdmin() {
  const { isAdmin } = useAuth();
  if (!isAdmin) return <Navigate to="/" replace />;
  return <Suspense fallback={<div className="center-page"><Spinner /></div>}><Outlet /></Suspense>;
}

/** Logged-in users visiting /login or /register go home. */
function GuestOnly() {
  const { session, sessionLoading } = useAuth();
  if (sessionLoading) return <div className="center-page"><Spinner /></div>;
  if (session) return <Navigate to="/" replace />;
  return <Outlet />;
}

export function App() {
  return (
    <>
      <UpdatePrompt />
      <Routes>
        <Route element={<GuestOnly />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        </Route>
        <Route path="/verify" element={<VerifyCodePage />} />
        <Route path="/auth/confirm" element={<ConfirmEmailPage />} />
        <Route path="/auth/reset-password" element={<ResetPasswordPage />} />
        <Route path="/account-disabled" element={<AccountDisabledPage />} />

        <Route element={<RequireAuth />}>
          <Route element={<UserShell />}>
            <Route index element={<HomePage />} />
            <Route path="/book" element={<FacilityListPage />} />
            <Route path="/book/:code" element={<BookFacilityPage />} />
            <Route path="/bookings" element={<MyBookingsPage />} />
            <Route path="/bookings/:id" element={<BookingDetailPage />} />
            <Route path="/profile" element={<ProfilePage />} />
          </Route>
          <Route element={<RequireAdmin />}>
            <Route element={<AdminShell />}>
              <Route path="/admin" element={<AdminDashboardPage />} />
              <Route path="/admin/bookings" element={<AdminBookingsPage />} />
              <Route path="/admin/blocks" element={<AdminBlocksPage />} />
              <Route path="/admin/users" element={<AdminUsersPage />} />
            </Route>
          </Route>
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </>
  );
}
