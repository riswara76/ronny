import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { adminListUsers, adminSetUserActive, adminSetUserRole } from '../../lib/api';
import type { AppError } from '../../lib/errors';
import type { AdminUser } from '../../lib/types';
import { useAuth } from '../../app/auth';
import { useDocumentTitle } from '../../app/hooks';
import { Badge, Button, ConfirmDialog, ErrorState, Spinner } from '../../components/ui';
import { useToast } from '../../components/toast';

type Pending = { user: AdminUser; action: 'deactivate' | 'activate' | 'promote' | 'demote' };

export function AdminUsersPage() {
  useDocumentTitle('Users');
  const qc = useQueryClient();
  const toast = useToast();
  const { session } = useAuth();
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');
  const [pending, setPending] = useState<Pending | null>(null);
  const [reason, setReason] = useState('');

  useEffect(() => {
    const t = window.setTimeout(() => setSearch(input.trim()), 350);
    return () => window.clearTimeout(t);
  }, [input]);

  const users = useQuery({ queryKey: ['admin', 'users', search], queryFn: () => adminListUsers(search) });
  const act = useMutation({
    mutationFn: async (p: Pending) => {
      if (p.action === 'deactivate' || p.action === 'activate') {
        const r = await adminSetUserActive(p.user.id, p.action === 'activate', reason.trim());
        return p.action === 'deactivate' ? `${p.user.full_name} was deactivated${r.cancelled_bookings ? ` and ${r.cancelled_bookings} future booking(s) cancelled` : ''}.` : `${p.user.full_name} was reactivated.`;
      }
      await adminSetUserRole(p.user.id, p.action === 'promote' ? 'ADMIN' : 'USER');
      return p.action === 'promote' ? `${p.user.full_name} is now an administrator.` : `${p.user.full_name} is no longer an administrator.`;
    },
    onSuccess: (msg) => {
      toast(msg);
      setPending(null);
      setReason('');
      void qc.invalidateQueries({ queryKey: ['admin'] });
    },
  });

  const titles: Record<Pending['action'], string> = {
    deactivate: 'Deactivate this user?', activate: 'Reactivate this user?', promote: 'Make this user an administrator?', demote: 'Remove administrator role?',
  };

  return (
    <div className="admin-page">
      <header className="admin-head"><h1>Users</h1></header>
      <form className="filters" role="search" onSubmit={(e) => e.preventDefault()}>
        <label className="inline-field grow"><span>Search</span>
          <span className="input-icon"><Search size={18} aria-hidden />
            <input type="search" placeholder="Name or email" value={input} onChange={(e) => setInput(e.target.value)} />
          </span></label>
      </form>
      {users.error ? <ErrorState message={(users.error as AppError).message} /> : users.isPending ? <Spinner /> : (
        <>
          <p className="muted small" aria-live="polite">{users.data.total} user{users.data.total === 1 ? '' : 's'}</p>
          <table className="data-table always">
            <thead><tr><th scope="col">Name</th><th scope="col">Status</th><th scope="col">Upcoming</th><th scope="col">No-shows</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {users.data.items.map((u) => {
                const self = u.id === session?.user.id;
                return (
                  <tr key={u.id} data-testid={`user-row-${u.email}`}>
                    <td>
                      {u.full_name} {u.role === 'ADMIN' && <Badge tone="info">Admin</Badge>}
                      <div className="muted small">{u.email}{!u.email_verified && ' · not verified'}</div>
                    </td>
                    <td>{u.is_active ? <Badge tone="success">Active</Badge> : <Badge tone="danger">Deactivated</Badge>}</td>
                    <td>{u.upcoming_bookings}</td>
                    <td>{u.no_shows}</td>
                    <td className="row-actions">
                      {u.is_active ? (
                        <Button size="sm" variant="secondary" className="danger-text" disabled={self}
                          onClick={() => { act.reset(); setPending({ user: u, action: 'deactivate' }); }}>Deactivate</Button>
                      ) : (
                        <Button size="sm" variant="secondary" onClick={() => { act.reset(); setPending({ user: u, action: 'activate' }); }}>Reactivate</Button>
                      )}
                      {u.role === 'ADMIN' ? (
                        <Button size="sm" variant="ghost" disabled={self} onClick={() => { act.reset(); setPending({ user: u, action: 'demote' }); }}>Remove admin</Button>
                      ) : (
                        <Button size="sm" variant="ghost" disabled={!u.is_active} onClick={() => { act.reset(); setPending({ user: u, action: 'promote' }); }}>Make admin</Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}
      <ConfirmDialog open={!!pending} title={pending ? titles[pending.action] : ''} danger={pending?.action === 'deactivate' || pending?.action === 'demote'}
        confirmLabel={pending?.action === 'deactivate' ? 'Deactivate user' : pending?.action === 'activate' ? 'Reactivate user' : pending?.action === 'promote' ? 'Make admin' : 'Remove admin role'}
        cancelLabel="Cancel" loading={act.isPending} error={act.error ? (act.error as AppError).message : null}
        onConfirm={() => pending && act.mutate(pending)} onClose={() => setPending(null)}>
        <p><strong>{pending?.user.full_name}</strong> · {pending?.user.email}</p>
        {pending?.action === 'deactivate' && (
          <>
            <p className="muted">They will immediately lose access to booking. Their future bookings will be cancelled and the times released.</p>
            <div className="field">
              <label htmlFor="deact-reason">Reason (for the audit log)</label>
              <input id="deact-reason" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
          </>
        )}
      </ConfirmDialog>
    </div>
  );
}
