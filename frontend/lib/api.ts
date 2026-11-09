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

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  let res = await send(path, options);

  const mayRefresh = !options.noRefresh && !NO_REFRESH_PATHS.includes(path);
  if (res.status === 401 && mayRefresh && (await refreshSession())) {
    res = await send(path, options);
  }

  const body = await parseBody(res);
  if (!res.ok) throw toApiError(res, body);
  return body as T;
}
