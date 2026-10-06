import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { adminCreateBlock, adminFacilities, adminListBlocks, adminRemoveBlock } from '../../lib/api';
import { AppError } from '../../lib/errors';
import type { AdminBlock, BlockReason, Booking } from '../../lib/types';
import { BLOCK_REASON_LABEL } from '../../lib/labels';
import { halfHourOptions } from '../../lib/time';
import { useAuth } from '../../app/auth';
import { useDocumentTitle } from '../../app/hooks';
import { Alert, Badge, Button, ConfirmDialog, ErrorState, Modal, Spinner, StatusBadge } from '../../components/ui';
import { useToast } from '../../components/toast';

const TIMES = halfHourOptions('00:00', '23:30');

export function AdminBlocksPage() {
  useDocumentTitle('Facility blocks');
  const qc = useQueryClient();
  const toast = useToast();
  const [includePast, setIncludePast] = useState(false);
  const [creating, setCreating] = useState(false);
  const [removing, setRemoving] = useState<AdminBlock | null>(null);
  const blocks = useQuery({ queryKey: ['admin', 'blocks', includePast], queryFn: () => adminListBlocks(includePast) });
  const remove = useMutation({
    mutationFn: (id: string) => adminRemoveBlock(id),
    onSuccess: () => {
      toast('Block removed. The time is bookable again.');
      setRemoving(null);
      void qc.invalidateQueries({ queryKey: ['admin'] });
      void qc.invalidateQueries({ queryKey: ['availability'] });
    },
  });

  return (
    <div className="admin-page">
      <header className="admin-head">
        <h1>Facility blocks</h1>
        <Button onClick={() => setCreating(true)}><Plus size={18} aria-hidden /> New block</Button>
      </header>
      <label className="check"><input type="checkbox" checked={includePast} onChange={(e) => setIncludePast(e.target.checked)} /> Show past and removed blocks</label>

      {blocks.error ? <ErrorState message={(blocks.error as AppError).message} /> : blocks.isPending ? <Spinner /> : blocks.data.length === 0 ? (
        <p className="muted">No {includePast ? '' : 'upcoming '}blocks.</p>
      ) : (
        <table className="data-table always">
          <thead><tr><th scope="col">Facility</th><th scope="col">From</th><th scope="col">Until</th><th scope="col">Reason</th><th scope="col">Created by</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>
            {blocks.data.map((k) => (
              <tr key={k.id}>
                <td>{k.facility.name}<div className="muted small">{k.resource ? k.resource.name : 'All resources'}</div></td>
                <td className="mono">{k.start_local}</td>
                <td className="mono">{k.end_local}</td>
                <td>{BLOCK_REASON_LABEL[k.reason_type]}{k.note && <div className="muted small">{k.note}</div>}</td>
                <td>{k.created_by.full_name}</td>
                <td>{k.removed_at ? <Badge>Removed</Badge> : k.can_remove ? (
                  <Button size="sm" variant="secondary" onClick={() => { remove.reset(); setRemoving(k); }}>Remove</Button>
                ) : <Badge>Ended</Badge>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <CreateBlockModal open={creating} onClose={() => setCreating(false)} />
      <ConfirmDialog open={!!removing} title="Remove this block?" confirmLabel="Remove block" cancelLabel="Keep block"
        loading={remove.isPending} error={remove.error ? (remove.error as AppError).message : null}
        onConfirm={() => removing && remove.mutate(removing.id)} onClose={() => setRemoving(null)}>
        <p>{removing?.facility.name} · {removing?.start_local} – {removing?.end_local}</p>
        <p className="muted">The time becomes bookable again immediately. Bookings cancelled by this block are not restored.</p>
      </ConfirmDialog>
    </div>
  );
}

function CreateBlockModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { config } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const facilities = useQuery({ queryKey: ['admin', 'facilities'], queryFn: adminFacilities, enabled: open, staleTime: 10 * 60_000 });
  const [form, setForm] = useState({
    facilityId: '', resourceId: '', startDate: config!.today, startTime: '09:00', endDate: config!.today, endTime: '12:00',
    reason: 'MAINTENANCE' as BlockReason, note: '',
  });
  const [conflicts, setConflicts] = useState<Booking[] | null>(null);
  const facility = facilities.data?.find((f) => f.id === form.facilityId);

  const create = useMutation({
    mutationFn: (cancelConflicts: boolean) => adminCreateBlock({
      facilityId: form.facilityId, resourceId: form.resourceId || null, startDate: form.startDate, startTime: form.startTime,
      endDate: form.endDate, endTime: form.endTime, reason: form.reason, note: form.note.trim(), cancelConflicts,
    }),
    onSuccess: (r) => {
      const n = r.cancelled_bookings.length;
      toast(n ? `Block created. ${n} booking${n === 1 ? ' was' : 's were'} cancelled.` : 'Block created.');
      void qc.invalidateQueries({ queryKey: ['admin'] });
      void qc.invalidateQueries({ queryKey: ['availability'] });
      close();
    },
    onError: (e: AppError) => {
      if (e.code === 'BLOCK_CONFLICTS') {
        const d = e.details as { conflicts?: Booking[] } | null;
        setConflicts(d?.conflicts ?? []);
      }
    },
  });

  function close() {
    setConflicts(null);
    create.reset();
    onClose();
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    create.mutate(false);
  }

  const err = create.error as AppError | null;
  return (
    <>
      <Modal open={open && !conflicts} onClose={close} title="New facility block" wide footer={
        <>
          <Button variant="secondary" onClick={close}>Cancel</Button>
          <Button type="submit" form="block-form" loading={create.isPending} disabled={!form.facilityId}>Create block</Button>
        </>
      }>
        <form id="block-form" className="form-grid" onSubmit={submit}>
          <div className="field">
            <label htmlFor="b-fac">Facility</label>
            <select id="b-fac" required value={form.facilityId} onChange={(e) => setForm({ ...form, facilityId: e.target.value, resourceId: '' })}>
              <option value="">Choose a facility</option>
              {facilities.data?.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="b-res">Resource</label>
            <select id="b-res" value={form.resourceId} onChange={(e) => setForm({ ...form, resourceId: e.target.value })} disabled={!facility}>
              <option value="">All resources</option>
              {facility && facility.resources.length > 1 && facility.resources.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="b-sd">Start date</label>
            <input id="b-sd" type="date" required value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="b-st">Start time</label>
            <select id="b-st" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })}>
              {TIMES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="b-ed">End date</label>
            <input id="b-ed" type="date" required value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="b-et">End time</label>
            <select id="b-et" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })}>
              {TIMES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="b-reason">Reason</label>
            <select id="b-reason" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value as BlockReason })}>
              {(Object.keys(BLOCK_REASON_LABEL) as BlockReason[]).map((r) => <option key={r} value={r}>{BLOCK_REASON_LABEL[r]}</option>)}
            </select>
          </div>
          <div className="field span-2">
            <label htmlFor="b-note">Note (admins only)</label>
            <textarea id="b-note" rows={2} maxLength={500} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </div>
        </form>
        <p className="muted small">Users see blocked times as "Unavailable" with the reason category. Notes are never shown to users.</p>
        {err && err.code !== 'BLOCK_CONFLICTS' && <Alert tone="danger">{err.message}</Alert>}
      </Modal>

      <Modal open={open && !!conflicts} onClose={() => setConflicts(null)} title="This block affects existing bookings" wide footer={
        <>
          <Button variant="secondary" onClick={() => setConflicts(null)} disabled={create.isPending}>Go back</Button>
          <Button variant="danger" onClick={() => create.mutate(true)} loading={create.isPending}>
            Cancel {conflicts?.length} booking{conflicts?.length === 1 ? '' : 's'} and create block
          </Button>
        </>
      }>
        <Alert tone="warning">
          These bookings will be cancelled ("Cancelled by admin"). The users will see it in My Bookings. This cannot be undone.
        </Alert>
        <ul className="mini-list" data-testid="block-conflicts">
          {conflicts?.map((b) => (
            <li key={b.id}>
              <span className="mono">{b.date} {b.start_time}–{b.end_time}</span>
              <span>{b.facility.code === 'BASKETBALL_FUTSAL' ? b.activity.name : b.facility.name}</span>
              <span className="truncate">{b.user?.full_name} · {b.user?.email}</span>
              <StatusBadge status={b.effective_status} />
            </li>
          ))}
        </ul>
        {err && err.code !== 'BLOCK_CONFLICTS' && <Alert tone="danger">{err.message}</Alert>}
      </Modal>
    </>
  );
}
