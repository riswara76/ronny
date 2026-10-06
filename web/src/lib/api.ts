// Thin typed wrappers around the Phase 2 RPCs. No business rule lives here.
import { supabase } from './supabase';
import { AppError, toAppError } from './errors';
import type {
  AdminBlock, AdminDashboard, AdminStats, AdminUser, AppConfig, Booking, BlockReason, FacilityOverview,
  FacilityRow, Paged, Profile, Slot,
} from './types';

type Listener = () => void;
const disabledListeners = new Set<Listener>();

/** Called whenever the server says the account is disabled (any RPC). */
export function onAccountDisabled(fn: Listener): () => void {
  disabledListeners.add(fn);
  return () => disabledListeners.delete(fn);
}

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  let result;
  try {
    result = await supabase.rpc(fn, args);
  } catch (e) {
    throw toAppError(e);
  }
  if (result.error) {
    const err = toAppError(result.error);
    if (err.code === 'ACCOUNT_DISABLED') disabledListeners.forEach((l) => l());
    throw err;
  }
  return result.data as T;
}

// ---------- User ----------
export const getAppConfig = () => rpc<AppConfig>('get_app_config');
export const getFacilitiesOverview = (date?: string) => rpc<FacilityOverview[]>('get_facilities_overview', { p_date: date ?? null });
export const getAvailability = (facilityId: string, date: string) =>
  rpc<Slot[]>('get_availability', { p_facility_id: facilityId, p_date: date });
export const createBooking = (a: { facilityId: string; activityId: string; date: string; startTime: string; duration: number }) =>
  rpc<Booking>('create_booking', {
    p_facility_id: a.facilityId, p_activity_id: a.activityId, p_date: a.date,
    p_start_time: a.startTime, p_duration_minutes: a.duration,
  });
export const cancelBooking = (id: string) => rpc<Booking>('cancel_booking', { p_booking_id: id });
export const checkIn = (id: string) => rpc<Booking>('check_in', { p_booking_id: id });
export const getMyBookings = (scope: 'UPCOMING' | 'HISTORY') => rpc<Booking[]>('get_my_bookings', { p_scope: scope, p_limit: 100 });
export const getBooking = (id: string) => rpc<Booking>('get_booking', { p_booking_id: id });

export async function getMyProfile(): Promise<Profile> {
  const { data, error } = await supabase.from('profiles').select('id, full_name, email, role, is_active').single();
  if (error) throw toAppError(error);
  return data as Profile;
}

// ---------- Admin ----------
export const adminDashboard = (date?: string) => rpc<AdminDashboard>('admin_dashboard', { p_date: date ?? null });
export const adminStats = (from: string, to: string) => rpc<AdminStats>('admin_stats', { p_from: from, p_to: to });
export const adminListBookings = (f: {
  from?: string; to?: string; facilityId?: string; status?: string; search?: string; limit?: number; offset?: number;
}) =>
  rpc<Paged<Booking>>('admin_list_bookings', {
    p_date_from: f.from || null, p_date_to: f.to || null, p_facility_id: f.facilityId || null,
    p_status: f.status || null, p_search: f.search || null, p_limit: f.limit ?? 50, p_offset: f.offset ?? 0,
  });
export const adminCancelBooking = (id: string, reason: string) =>
  rpc<Booking>('admin_cancel_booking', { p_booking_id: id, p_reason: reason || null });
export const adminListBlocks = (includePast = false) => rpc<AdminBlock[]>('admin_list_blocks', { p_include_past: includePast });
export const adminCreateBlock = (b: {
  facilityId: string; resourceId: string | null; startDate: string; startTime: string; endDate: string; endTime: string;
  reason: BlockReason; note: string; cancelConflicts: boolean;
}) =>
  rpc<{ block: { id: string }; cancelled_bookings: Booking[] }>('admin_create_block', {
    p_facility_id: b.facilityId, p_resource_id: b.resourceId, p_start_date: b.startDate, p_start_time: b.startTime,
    p_end_date: b.endDate, p_end_time: b.endTime, p_reason_type: b.reason, p_note: b.note || null,
    p_cancel_conflicts: b.cancelConflicts,
  });
export const adminRemoveBlock = (id: string) => rpc<unknown>('admin_remove_block', { p_block_id: id });
export const adminListUsers = (search: string, offset = 0) =>
  rpc<Paged<AdminUser>>('admin_list_users', { p_search: search || null, p_limit: 50, p_offset: offset });
export const adminSetUserActive = (id: string, active: boolean, reason: string) =>
  rpc<{ cancelled_bookings: number }>('admin_set_user_active', { p_user_id: id, p_active: active, p_reason: reason || null });
export const adminSetUserRole = (id: string, role: 'USER' | 'ADMIN') => rpc<unknown>('admin_set_user_role', { p_user_id: id, p_role: role });

export async function adminFacilities(): Promise<FacilityRow[]> {
  const { data, error } = await supabase
    .from('facilities')
    .select('id, code, name, sort_order, resources(id, name, sort_order)')
    .order('sort_order');
  if (error) throw toAppError(error);
  return (data as FacilityRow[]).map((f) => ({ ...f, resources: [...f.resources].sort((a, b) => a.sort_order - b.sort_order) }));
}

export { AppError };
