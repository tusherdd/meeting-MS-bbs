/**
 * The one fetch client for the backend.
 * - Calls the same origin (/api/v1/...); next.config.ts forwards it to the NestJS backend.
 * - Auth lives only in httpOnly cookies set by the backend: no token is ever read or stored here.
 * - On 401 it calls POST /auth/refresh once (shared by all requests that fail at the same time)
 *   and retries the original request a single time.
 * - Errors become ApiError with the backend's Bangla message and the requestId.
 */
import { t } from "@/messages";
import type { ApiErrorBody } from "./types";

export const API_BASE = "/api/v1";

export class ApiError extends Error {
  readonly status: number;
  readonly requestId?: string;
  /** The parsed error body (e.g. `blocking` for a meeting clash). */
  readonly body?: ApiErrorBody;

  constructor(status: number, message: string, requestId?: string, body?: ApiErrorBody) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.requestId = requestId;
    this.body = body;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

type QueryValue = string | number | boolean | null | undefined;

export interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  query?: Record<string, QueryValue>;
  signal?: AbortSignal;
  /** Do not try a refresh on 401 (login, refresh itself, public pages). */
  noRefresh?: boolean;
}

/** Paths where a 401 means "wrong input", not "session expired". */
const NO_REFRESH_PATHS = ["/auth/login", "/auth/refresh", "/auth/logout"];

let refreshInFlight: Promise<boolean> | null = null;

/** Exactly one POST /auth/refresh at a time; everybody waiting gets the same result. */
function refreshSession(): Promise<boolean> {
  refreshInFlight ??= fetch(`${API_BASE}/auth/refresh`, {
    method: "POST",
    credentials: "include",
    headers: { Accept: "application/json" },
  })
    .then((res) => res.ok)
    .catch(() => false)
    .finally(() => {
      refreshInFlight = null;
    });
  return refreshInFlight;
}

function buildUrl(path: string, query?: RequestOptions["query"]): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  }
  const qs = params.toString();
  return `${API_BASE}${path}${qs ? `?${qs}` : ""}`;
}

async function parseBody(res: Response): Promise<unknown> {
  if (res.status === 204) return undefined;
  const type = res.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    try {
      return await res.json();
    } catch {
      return undefined;
    }
  }
  const text = await res.text();
  return text || undefined;
}

function toApiError(res: Response, body: unknown): ApiError {
  const requestId = res.headers.get("x-request-id") ?? undefined;
  if (body && typeof body === "object" && "message" in body) {
    const errorBody = body as ApiErrorBody;
    const message = Array.isArray(errorBody.message)
      ? errorBody.message.join(" ")
      : String(errorBody.message || t.errors.unknown);
    return new ApiError(res.status, message, errorBody.requestId ?? requestId, errorBody);
  }
  return new ApiError(res.status, t.errors.unknown, requestId);
}

async function send(path: string, options: RequestOptions): Promise<Response> {
  const headers: Record<string, string> = { Accept: "application/json" };
  let body: BodyInit | undefined;
  if (options.body instanceof FormData) {
    body = options.body; // the browser sets the multipart boundary
  } else if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.body);
  }
  try {
    return await fetch(buildUrl(path, options.query), {
      method: options.method ?? "GET",
      credentials: "include",
      headers,
      body,
      signal: options.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new ApiError(0, t.errors.network);
  }
}

/** Listeners for "the session is gone" (refresh failed): the guard sends the user to /login. */
type SessionListener = () => void;
const sessionListeners = new Set<SessionListener>();

export function onSessionExpired(listener: SessionListener): () => void {
  sessionListeners.add(listener);
  return () => sessionListeners.delete(listener);
}

async function sendWithRefresh(path: string, options: RequestOptions): Promise<Response> {
  let res = await send(path, options);
  const mayRefresh = !options.noRefresh && !NO_REFRESH_PATHS.includes(path);
  if (res.status === 401 && mayRefresh) {
    if (await refreshSession()) {
      res = await send(path, options);
    }
    // Still 401 after a refresh attempt: the session really ended (expired, revoked, logged out elsewhere).
    if (res.status === 401 && path !== "/auth/me") sessionListeners.forEach((l) => l());
  }
  return res;
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const res = await sendWithRefresh(path, options);
  const body = await parseBody(res);
  if (!res.ok) throw toApiError(res, body);
  return body as T;
}

export interface DownloadedFile {
  blob: Blob;
  filename: string;
}

/** `attachment; filename="meeting-report-2026-11.pdf"` → the file name (RFC 6266 basics). */
export function filenameFromDisposition(header: string | null, fallback: string): string {
  if (!header) return fallback;
  const star = /filename\*\s*=\s*(?:UTF-8'')?([^;]+)/i.exec(header);
  if (star) {
    try {
      return decodeURIComponent(star[1].trim().replace(/^"|"$/g, ""));
    } catch {
      // fall through to the plain form
    }
  }
  const plain = /filename\s*=\s*"?([^";]+)"?/i.exec(header);
  const name = plain?.[1]?.trim();
  // Never accept a path, only a plain file name.
  return name && !/[\\/]/.test(name) ? name : fallback;
}

/** GET a file (PDF) as a Blob, with the same session refresh and Bangla errors as api(). */
export async function apiDownload(
  path: string,
  options: Pick<RequestOptions, "query" | "signal"> & { fallbackName: string },
): Promise<DownloadedFile> {
  const res = await sendWithRefresh(path, { query: options.query, signal: options.signal });
  if (!res.ok) throw toApiError(res, await parseBody(res));
  return {
    blob: await res.blob(),
    filename: filenameFromDisposition(res.headers.get("content-disposition"), options.fallbackName),
  };
}

/** Let the browser save a downloaded Blob under `filename`. */
export function saveBlob({ blob, filename }: DownloadedFile): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
