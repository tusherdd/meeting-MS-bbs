"use client";

import { hashKey, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { isApiError } from "@/lib/api";
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

  const me = useQuery({
    queryKey: queryKeys.me,
    queryFn: loadMe,
    retry: false,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: true,
  });

  const setLoggedIn = useCallback(
    (res: LoginResponse) => {
      clearCacheExceptMe(queryClient);
      queryClient.setQueryData(queryKeys.me, res.user);
    },
    [queryClient],
  );

  const reload = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.me });
  }, [queryClient]);

  const logout = useCallback(async () => {
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
