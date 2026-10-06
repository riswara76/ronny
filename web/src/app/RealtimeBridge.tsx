import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from './auth';

/**
 * Listens to the private "availability" broadcast (payload: facility_id + date range only)
 * and refetches what is on screen. A UX hint only: correctness is enforced by the booking RPC.
 */
export function RealtimeBridge() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const token = session?.access_token;

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      await supabase.realtime.setAuth(token);
      if (cancelled) return;
      channel = supabase
        .channel('availability', { config: { private: true } })
        .on('broadcast', { event: 'availability_changed' }, ({ payload }) => {
          const facilityId = (payload as { facility_id?: string }).facility_id;
          if (facilityId) void queryClient.invalidateQueries({ queryKey: ['availability', facilityId] });
          void queryClient.invalidateQueries({ queryKey: ['overview'] });
        })
        .subscribe((status) => {
          if (import.meta.env.DEV && status !== 'SUBSCRIBED') console.warn('realtime', status);
          document.documentElement.dataset.realtime = status;
        });
    })();

    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [token, queryClient]);

  return null;
}
