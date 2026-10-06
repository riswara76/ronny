import type { BlockReason, BookingStatus, Slot } from './types';

export const BOOKING_STATUS_LABEL: Record<BookingStatus, string> = {
  CONFIRMED: 'Confirmed',
  CHECKED_IN: 'Checked in',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  ADMIN_CANCELLED: 'Cancelled by admin',
  NO_SHOW: 'No-show',
};

export type Tone = 'success' | 'info' | 'neutral' | 'danger' | 'warning';

export const BOOKING_STATUS_TONE: Record<BookingStatus, Tone> = {
  CONFIRMED: 'info',
  CHECKED_IN: 'success',
  COMPLETED: 'neutral',
  CANCELLED: 'neutral',
  ADMIN_CANCELLED: 'danger',
  NO_SHOW: 'warning',
};

export const BLOCK_REASON_LABEL: Record<BlockReason, string> = {
  MAINTENANCE: 'Maintenance',
  DCU_PROGRAM: 'DCU programme',
  PRIVATE_EVENT: 'Private event',
  OTHER: 'Other',
};

/** Short label shown under a time in the slot grid. Never contains anyone's identity. */
export function slotLabel(s: Slot): string {
  switch (s.status) {
    case 'AVAILABLE':
      return s.total_count > 1 ? (s.available_count === 1 ? '1 spot left' : `${s.available_count} spots left`) : 'Available';
    case 'MINE':
      return 'Your booking';
    case 'BOOKED':
      return 'Booked';
    case 'FULL':
      return 'Full';
    case 'BLOCKED':
      return s.block_reason ? `Unavailable · ${BLOCK_REASON_LABEL[s.block_reason]}` : 'Unavailable';
    case 'PAST':
      return 'Past';
    default:
      return 'Unavailable';
  }
}

export const FACILITY_DESCRIPTION: Record<string, string> = {
  TENNIS: '1 court · 30, 60 or 90 minutes',
  BASKETBALL_FUTSAL: 'Shared court · Basketball or Futsal · up to 90 minutes',
  TABLE_TENNIS: '1 table · 30 minutes',
  FOOTBALL: '1 field · 30 minutes',
  AIR_HOCKEY: '2 tables · 30 minutes',
  FOOSBALL: '2 tables · 30 minutes',
};
