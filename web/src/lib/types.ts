// Shapes returned by the Phase 2 RPCs (see supabase/migrations/*booking_engine.sql and *admin.sql).

export type BookingStatus = 'CONFIRMED' | 'CHECKED_IN' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW' | 'ADMIN_CANCELLED';
export type SlotStatus = 'PAST' | 'MINE' | 'AVAILABLE' | 'BOOKED' | 'FULL' | 'BLOCKED' | 'UNAVAILABLE';
export type BlockReason = 'MAINTENANCE' | 'DCU_PROGRAM' | 'PRIVATE_EVENT' | 'OTHER';

export interface AppConfig {
  server_now: string;
  timezone: string;
  today: string;
  last_bookable_date: string;
  open_time: string;
  close_time: string;
  slot_minutes: number;
  booking_horizon_days: number;
  max_active_bookings: number;
  checkin_early_minutes: number;
  checkin_late_minutes: number;
  is_admin: boolean;
}

export interface Activity {
  id: string;
  code: string;
  name: string;
}

export interface FacilityOverview {
  facility_id: string;
  code: string;
  name: string;
  icon_key: string;
  allowed_durations: number[];
  activities: Activity[];
  available_slots: number;
  blocked_slots: number;
}

export interface Slot {
  slot_start: string; // "HH:MM:SS"
  slot_end: string;
  status: SlotStatus;
  available_count: number;
  total_count: number;
  max_duration_minutes: number;
  block_reason: BlockReason | null;
}

export interface Booking {
  id: string;
  booking_code: string;
  facility: { id: string; code: string; name: string; icon_key: string };
  activity: { id: string; code: string; name: string };
  date: string;
  start_time: string; // "HH:MM" Jakarta
  end_time: string;
  start_at: string;
  end_at: string;
  duration_minutes: number;
  status: BookingStatus;
  effective_status: BookingStatus;
  checked_in_at: string | null;
  cancelled_at: string | null;
  cancellation_type: 'USER' | 'ADMIN' | 'SYSTEM_BLOCK' | 'SYSTEM_DEACTIVATION' | null;
  cancellation_reason: string | null;
  checkin_opens_at: string;
  checkin_closes_at: string;
  can_cancel: boolean;
  can_check_in: boolean;
  created_at: string;
  // Admin-only fields
  user?: { id: string; full_name: string; email: string };
  resource?: { id: string; name: string };
  cancelled_by?: string | null;
}

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  role: 'USER' | 'ADMIN';
  is_active: boolean;
}

export interface AdminBlock {
  id: string;
  facility: { id: string; code: string; name: string };
  resource: { id: string; name: string } | null;
  start_at: string;
  end_at: string;
  start_local: string;
  end_local: string;
  reason_type: BlockReason;
  note: string | null;
  created_by: { id: string; full_name: string };
  created_at: string;
  removed_at: string | null;
  can_remove: boolean;
}

export interface AdminUser {
  id: string;
  full_name: string;
  email: string;
  role: 'USER' | 'ADMIN';
  is_active: boolean;
  deactivated_at: string | null;
  created_at: string;
  email_verified: boolean;
  upcoming_bookings: number;
  total_bookings: number;
  no_shows: number;
}

export interface Paged<T> {
  total: number;
  items: T[];
}

export interface AdminDashboard {
  date: string;
  bookings_on_date: number;
  upcoming_bookings: number;
  checked_in_on_date: number;
  no_shows_last_7_days: number;
  active_users: number;
  utilization: { facility_id: string; name: string; booked_minutes: number; capacity_minutes: number; utilization_pct: number }[];
}

export interface AdminStats {
  totals: { bookings: number; cancelled_by_user: number; cancelled_by_admin: number; no_shows: number; completed: number };
}

export interface FacilityRow {
  id: string;
  code: string;
  name: string;
  sort_order: number;
  resources: { id: string; name: string; sort_order: number }[];
}
