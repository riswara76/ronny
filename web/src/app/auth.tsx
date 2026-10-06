import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { getAppConfig, getMyProfile, onAccountDisabled } from '../lib/api';
import type { AppConfig, Profile } from '../lib/types';
import type { AppError } from '../lib/errors';

interface AuthState {
  session: Session | null;
  sessionLoading: boolean;
  config: AppConfig | undefined;
  configError: AppError | null;
  profile: Profile | undefined;
  /** Server time offset (ms) so countdowns and button states follow the server clock, not the phone's. */
  clockOffset: number;
  disabled: boolean;
  isAdmin: boolean;
  refreshConfig: () => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [disabled, setDisabled] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setSessionLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (!s) {
        setDisabled(false);
        queryClient.clear();
      }
    });
    const off = onAccountDisabled(() => setDisabled(true));
    return () => {
      data.subscription.unsubscribe();
      off();
    };
  }, [queryClient]);

  const userId = session?.user.id;

  const configQuery = useQuery({
    queryKey: ['config', userId],
    enabled: !!userId,
    queryFn: async () => {
      const sent = Date.now();
      const config = await getAppConfig();
      const received = Date.now();
      return { config, offset: new Date(config.server_now).getTime() - (sent + received) / 2 };
    },
    staleTime: 5 * 60_000,
    refetchInterval: 15 * 60_000,
  });

  const profileQuery = useQuery({
    queryKey: ['profile', userId],
    enabled: !!userId && !disabled,
    queryFn: () => getMyProfile(userId!),
    staleTime: 5 * 60_000,
  });

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    queryClient.clear();
  }, [queryClient]);

  const configError = (configQuery.error as AppError | null) ?? null;
  const value = useMemo<AuthState>(
    () => ({
      session,
      sessionLoading,
      config: configQuery.data?.config,
      configError,
      profile: profileQuery.data,
      clockOffset: configQuery.data?.offset ?? 0,
      disabled: disabled || configError?.code === 'ACCOUNT_DISABLED',
      isAdmin: !!configQuery.data?.config.is_admin,
      refreshConfig: () => void configQuery.refetch(),
      signOut,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [session, sessionLoading, configQuery.data, configError, profileQuery.data, disabled, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}
