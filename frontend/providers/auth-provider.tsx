"use client";

import { hashKey, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { isApiError, onSessionExpired } from "@/lib/api";
import { authApi, queryKeys } from "@/lib/endpoints";
import { isAdmin } from "@/lib/roles";
import type { LoginResponse, Me } from "@/lib/types";

interface AuthState {
  /** undefined = still loading, null = not logged in. */
  user: Me | null | undefined;
  isLoading: boolean;
  /** The /auth/me call failed for another reason than "not logged in" (e.g. backend down). */
  error: unknown;
  isAdmin: boolean;
  /** Put the login response into the cache (no extra /auth/me round trip). */
  setLoggedIn: (res: LoginResponse) => void;
  /** Reload /auth/me (after a password change, for example). */
  reload: () => Promise<void>;
  /** POST /auth/logout, then forget every cached server answer. */
  logout: () => Promise<void>;
  /** True after the user clicked "লগআউট" (the guard then goes to /login without ?next=). */
  isLoggingOut: () => boolean;
}

const AuthContext = createContext<AuthState | null>(null);

/**
 * Drop every cached server answer except the /auth/me entry itself (that one stays observed by
 * this provider and is overwritten right after), so no data of a previous user survives.
 */
function clearCacheExceptMe(queryClient: ReturnType<typeof useQueryClient>) {
  const meHash = hashKey(queryKeys.me);
  void queryClient.cancelQueries({ predicate: (q) => q.queryHash !== meHash });
  queryClient.removeQueries({ predicate: (q) => q.queryHash !== meHash });
  queryClient.getMutationCache().clear();
}

/** GET /auth/me; 401 after the automatic refresh means "not logged in" → null. */
async function loadMe(): Promise<Me | null> {
  try {
    return await authApi.me();
  } catch (err) {
    if (isApiError(err) && err.status === 401) return null;
    throw err;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const loggingOut = useRef(false);

  const me = useQuery({
    queryKey: queryKeys.me,
    queryFn: loadMe,
    retry: false,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: true,
  });

  // A request got 401 even after a refresh: the session ended (expired, revoked, logged out in
  // another tab). Forget the user; the guard sends them to /login?next=…&reason=expired.
  useEffect(
    () =>
      onSessionExpired(() => {
        if (loggingOut.current || !queryClient.getQueryData(queryKeys.me)) return;
        clearCacheExceptMe(queryClient);
        queryClient.setQueryData(queryKeys.me, null);
      }),
    [queryClient],
  );

  const setLoggedIn = useCallback(
    (res: LoginResponse) => {
      loggingOut.current = false;
      clearCacheExceptMe(queryClient);
      queryClient.setQueryData(queryKeys.me, res.user);
    },
    [queryClient],
  );

  const reload = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.me });
  }, [queryClient]);

  const logout = useCallback(async () => {
    loggingOut.current = true;
    try {
      await authApi.logout();
    } catch {
      // Even if the server call fails (expired session), the local state is cleared below.
    }
    clearCacheExceptMe(queryClient);
    queryClient.setQueryData(queryKeys.me, null);
    router.replace("/login");
  }, [queryClient, router]);

  const value = useMemo<AuthState>(
    () => ({
      user: me.data,
      isLoading: me.isPending,
      error: me.error,
      isAdmin: isAdmin(me.data),
      setLoggedIn,
      reload,
      logout,
      isLoggingOut: () => loggingOut.current,
    }),
    [me.data, me.isPending, me.error, setLoggedIn, reload, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

/** For pages inside (app): the guard guarantees a user is present. */
export function useCurrentUser(): Me {
  const { user } = useAuth();
  if (!user) throw new Error("useCurrentUser used outside the authenticated area");
  return user;
}
