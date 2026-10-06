import { useEffect, useState } from 'react';
import { useAuth } from './auth';

/** Browser connectivity. Booking actions are disabled while offline; nothing is queued. */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

/** Server-aligned "now" (ms), re-rendering every `everyMs`. Display only; the server decides. */
export function useServerNow(everyMs = 30_000): number {
  const { clockOffset } = useAuth();
  const [tick, setTick] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setTick(Date.now()), everyMs);
    return () => window.clearInterval(t);
  }, [everyMs]);
  return tick + clockOffset;
}

export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = title ? `${title} · DCU Active` : 'DCU Active';
  }, [title]);
}
